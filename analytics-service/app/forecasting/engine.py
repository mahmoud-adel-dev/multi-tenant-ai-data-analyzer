"""Forecasting with honest guardrails and baseline accountability.

Rules enforced here:
1. A forecast exists ONLY when: >= 12 complete periods exist, the series has
   variance, and holdout validation beats BOTH a fixed error threshold AND a
   naive baseline. A withheld forecast is better than a fabricated one.
2. Validation is chronological (last ~20% of periods held out) — never random.
3. Every reported forecast compares against a naive baseline; if the model
   cannot beat "repeat the last value", we say so instead of shipping noise.
4. Uncertainty bands widen with horizon (sqrt-of-step scaling).
"""
from __future__ import annotations

from typing import Any

import numpy as np

from app.schemas.contract import Forecast, TimeSeriesPoint, TrendAnalysis

MIN_PERIODS = 12
FORECAST_HORIZONS = {"day": 14, "week": 8, "month": 6, "quarter": 4, "year": 2}
MAX_MAPE = 60.0


def _mape(actual: np.ndarray, predicted: np.ndarray) -> float | None:
    mask = actual != 0
    if not mask.any():
        return None
    return float(np.mean(np.abs((actual[mask] - predicted[mask]) / actual[mask])) * 100)


def _naive_baseline(train: np.ndarray, test: np.ndarray, granularity: str) -> np.ndarray:
    """Seasonal naive where a cycle is meaningful, otherwise last-value naive."""
    lag = {"day": 7, "week": 4}.get(granularity)
    if lag and len(train) > lag:
        seasonal = np.tile(train[-lag:], int(np.ceil(len(test) / lag)))[: len(test)]
        return seasonal
    return np.full(len(test), train[-1])


def _fit_holt(train: np.ndarray) -> Any:
    from statsmodels.tsa.holtwinters import Holt

    return Holt(train, damped_trend=True).fit(optimized=True)


def build_forecasts(
    trends: list[TrendAnalysis],
    max_forecasts: int = 2,
    eligible: bool = True,
) -> tuple[list[Forecast], list[str]]:
    forecasts: list[Forecast] = []
    warnings: list[str] = []

    if not eligible:
        if trends:
            warnings.append("Forecasting skipped: the analysis plan did not find an eligible time series.")
        return forecasts, warnings

    for trend in trends[: max_forecasts + 2]:
        if len(forecasts) >= max_forecasts:
            break

        values = [p.value for p in trend.series]
        if len(values) < MIN_PERIODS:
            continue

        arr = np.asarray(values, dtype=float)
        if float(np.std(arr)) == 0:
            warnings.append(f"Forecast skipped for {trend.metricColumn}: series has zero variance.")
            continue

        # ── Chronological holdout validation ────────────────────────────
        split = max(MIN_PERIODS - 2, int(len(arr) * 0.8))
        train, test = arr[:split], arr[split:]

        try:
            model = _fit_holt(train)
            preds_test = np.asarray(model.forecast(steps=len(test)), dtype=float)
        except Exception:
            warnings.append(f"Forecast skipped for {trend.metricColumn}: model failed to converge.")
            continue

        model_mape = _mape(test, preds_test)
        baseline_preds = _naive_baseline(train, test, trend.granularity)
        baseline_mape = _mape(test, baseline_preds)
        mae = float(np.mean(np.abs(test - preds_test)))

        if model_mape is None or model_mape > MAX_MAPE:
            detail = f"holdout MAPE={model_mape:.0f}%" if model_mape is not None else "zero-variance holdout"
            warnings.append(
                f"Forecast withheld for {trend.metricColumn}: pattern not stable enough ({detail})."
            )
            continue

        if baseline_mape is not None and model_mape >= baseline_mape:
            warnings.append(
                f"Forecast withheld for {trend.metricColumn}: holdout MAPE {model_mape:.1f}% did not "
                f"beat the naive baseline ({baseline_mape:.1f}%). The series carries no learnable signal."
            )
            continue

        # ── Refit on full (complete-period) history for production run ──
        try:
            full_model = _fit_holt(arr)
            horizon = FORECAST_HORIZONS.get(trend.granularity, 6)
            future = np.asarray(full_model.forecast(steps=horizon), dtype=float)
        except Exception:
            warnings.append(f"Forecast skipped for {trend.metricColumn}: final refit failed.")
            continue

        # Noise proxy from one-step differences (no convolution edge artifacts).
        sigma = float(np.std(np.diff(arr))) or float(np.std(arr))
        confidence_level = 0.95

        last_period = trend.series[-1].period
        future_periods = _next_periods(last_period, trend.granularity, horizon)

        predictions = [
            {
                "period": period,
                "value": round(float(v), 4),
                "lower": round(float(v) - confidence_level * sigma * np.sqrt(i + 1), 4),
                "upper": round(float(v) + confidence_level * sigma * np.sqrt(i + 1), 4),
            }
            for i, (period, v) in enumerate(zip(future_periods, future))
        ]

        skill = None
        if baseline_mape not in (None, 0):
            skill = round((baseline_mape - model_mape) / baseline_mape, 3)

        confidence = "high" if model_mape < 10 else ("medium" if model_mape < 25 else "low")

        forecast_warnings = [
            f"Chronological holdout on the last {len(test)} periods: model MAPE {model_mape:.1f}% vs naive baseline {baseline_mape:.1f}%." if baseline_mape is not None else f"Holdout MAPE {model_mape:.1f}%.",
            "Uncertainty bands widen with horizon; forecasts are directional estimates, not guarantees.",
        ]

        forecasts.append(
            Forecast(
                metricColumn=trend.metricColumn,
                dateColumn=trend.dateColumn,
                model="Holt damped-trend exponential smoothing",
                horizonPeriods=len(predictions),
                granularity=trend.granularity,
                history=list(trend.series),
                predictions=predictions,
                fitMetrics={
                    "mape": round(model_mape, 2),
                    "mae": round(mae, 4),
                    "baselineMape": round(baseline_mape, 2) if baseline_mape is not None else None,
                    "skillScore": skill,
                },
                warnings=forecast_warnings,
                confidence=confidence,
                validationMethod="chronological holdout vs naive baseline",
            )
        )

    return forecasts, warnings


def _next_periods(last_period: str, granularity: str, n: int) -> list[str]:
    """Generates the next n period labels strictly after `last_period`,
    using the exact same label format as the historical series."""
    from datetime import date, timedelta

    results: list[str] = []

    if granularity == "day":
        y, m, d = (int(x) for x in last_period.split("-"))
        current = date(y, m, d)
        for i in range(1, n + 1):
            results.append((current + timedelta(days=i)).strftime("%Y-%m-%d"))
        return results

    if granularity == "week":
        year_s, week_s = last_period.split("-W")
        monday = date.fromisocalendar(int(year_s), min(52, int(week_s)), 1)
        for i in range(1, n + 1):
            iso = (monday + timedelta(days=7 * i)).isocalendar()
            results.append(f"{iso.year}-W{iso.week:02d}")
        return results

    if granularity == "month":
        year, month = int(last_period[:4]), int(last_period[5:7])
        for i in range(1, n + 1):
            month_index = (month - 1) + i
            yy = year + month_index // 12
            mm = month_index % 12 + 1
            results.append(f"{yy}-{mm:02d}")
        return results

    if granularity == "quarter":
        year, quarter = int(last_period[:4]), int(last_period[-1])
        q_index = year * 4 + (quarter - 1)
        for i in range(1, n + 1):
            qi = q_index + i
            results.append(f"{qi // 4}Q{qi % 4 + 1}")
        return results

    if granularity == "year":
        year = int(last_period)
        for i in range(1, n + 1):
            results.append(str(year + i))
        return results

    raise ValueError(f"Unsupported granularity: {granularity}")


__all__ = ["build_forecasts"]
