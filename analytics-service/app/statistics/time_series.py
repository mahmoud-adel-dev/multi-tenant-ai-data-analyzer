"""Time-series detection, trend classification and seasonality.

Trend classification contract (documented thresholds — the label ALWAYS
includes the measured change so text can never contradict the number):

    |change| <  5%            -> stable
    5% .. 25%                 -> moderate_growth / moderate_decline
    > 25%                     -> strong_growth  / strong_decline
    relative std > 0.8        -> high_volatility (overrides endpoint direction)
    fewer than 5 periods      -> insufficient_data

Partial-bucket guard: if the final period bucket is incomplete (the dataset's
max date ends mid-period), it is excluded from the series — an artificially
small trailing bucket previously produced a visible drop right before the
forecast.
"""
from __future__ import annotations

import calendar
from datetime import date, timedelta
from typing import Any

import numpy as np
import polars as pl

from app.schemas.contract import TimeSeriesPoint, TrendAnalysis
from app.profiling.normalize import guess_semantic_columns

STABLE_BAND = 5.0     # percent
MODERATE_BAND = 25.0  # percent
VOLATILITY_THRESHOLD = 0.8  # relative std of bucket values


def _choose_granularity(span_days: float) -> str:
    if span_days <= 70:
        return "day"
    if span_days <= 3 * 365:
        return "week"
    return "month"


def _to_period_expr(granularity: str) -> pl.Expr:
    if granularity == "day":
        return pl.col("_date").dt.strftime("%Y-%m-%d")
    if granularity == "week":
        return pl.col("_date").dt.strftime("%G-W%V")
    if granularity == "quarter":
        return pl.concat_str(
            [pl.col("_date").dt.year().cast(pl.String), pl.lit("Q"), pl.col("_date").dt.quarter().cast(pl.String)]
        )
    if granularity == "year":
        return pl.col("_date").dt.strftime("%Y")
    return pl.col("_date").dt.strftime("%Y-%m")


def _period_end(period_label: str, granularity: str) -> date | None:
    """Best-effort calendar end of a period bucket."""
    try:
        if granularity == "month":
            year, month = int(period_label[:4]), int(period_label[5:7])
            return date(year, month, calendar.monthrange(year, month)[1])
        if granularity == "year":
            return date(int(period_label), 12, 31)
        if granularity == "quarter":
            year = int(period_label[:4])
            quarter = int(period_label[-1])
            month = quarter * 3
            return date(year, month, calendar.monthrange(year, month)[1])
    except Exception:
        return None
    return None  # day/week buckets are treated as complete by construction


def _moving_average(values: list[float], window: int) -> list[float]:
    result: list[float] = []
    for i in range(len(values)):
        lo = max(0, i - window + 1)
        chunk = values[lo : i + 1]
        result.append(sum(chunk) / len(chunk))
    return result


def _classify(values: list[float]) -> tuple[str, str]:
    """Returns (direction_key, direction_label). Label always cites the number."""
    n = len(values)
    first, last = values[0], values[-1]
    mean_abs = abs(sum(values) / n) or 1e-9
    rel_std = float(np.std(values)) / mean_abs

    if n < 5 or np.allclose(values, values[0]):
        return "insufficient_data", "Insufficient Data"

    change_pct = (last - first) / abs(first) * 100.0 if first != 0 else None

    if rel_std > VOLATILITY_THRESHOLD:
        note = f"{change_pct:+.1f}% endpoint change" if change_pct is not None else "unstable endpoints"
        return "high_volatility", f"High Volatility ({note})"

    if change_pct is None:
        return "stable", "Stable (baseline zero)"
    if change_pct > MODERATE_BAND:
        return "strong_growth", f"Strong Growth (+{change_pct:.1f}%)"
    if change_pct > STABLE_BAND:
        return "moderate_growth", f"Moderate Growth (+{change_pct:.1f}%)"
    if change_pct >= -STABLE_BAND:
        return "stable", f"Stable ({change_pct:+.1f}%)"
    if change_pct >= -MODERATE_BAND:
        return "moderate_decline", f"Moderate Decline ({change_pct:.1f}%)"
    return "strong_decline", f"Strong Decline ({change_pct:.1f}%)"


def _build_insight(metric_col: str, periods: list[str], values: list[float], direction: str, seasonality: bool) -> str:
    n = len(values)
    peak_i = int(np.argmax(values))
    low_i = int(np.argmin(values))
    parts = [
        f"{metric_col} moved from {values[0]:,.2f} to {values[-1]:,.2f} across {n} {periods[0]}–{periods[-1]} periods."
    ]
    if n >= 3 and (peak_i != n - 1 or low_i != n - 1):
        parts.append(f"Peak {values[peak_i]:,.2f} at {periods[peak_i]}; lowest {values[low_i]:,.2f} at {periods[low_i]}.")
    if direction == "high_volatility":
        parts.append("Period-to-period swings are large relative to the level; treat any single-direction reading with caution.")
    elif direction.startswith(("strong_", "moderate_")):
        parts.append("The available data does not establish causality for this movement.")
    if seasonality:
        parts.append("A repeating cycle was detected in the series.")
    return " ".join(parts)


def _measure_priority(p: Any) -> int:
    """Revenue-like measures lead trends; identifiers never qualify."""
    return {"revenue": 0, "quantity": 1, "profit_margin": 2, "cost": 3, "shipping_cost": 4, "tax": 5, "discount": 6, "price": 7, "duration": 8}.get(
        getattr(p, "semanticType", None), 9
    )


def detect_time_series(
    df: pl.DataFrame,
    profiles: list[Any],
    max_series: int = 4,
    semantic_hints: dict[str, list[str]] | None = None,
) -> list[TrendAnalysis]:
    """Finds (date column, measure column) pairs and computes classified trends."""
    semantic = guess_semantic_columns(df)

    date_columns: list[str] = [p.name for p in profiles if p.role == "date"]
    for candidate in semantic.get("order_date", []) + semantic.get("ship_date", []):
        if candidate not in date_columns and df.schema[candidate] in (pl.String, pl.Utf8):
            parsed = df[candidate].str.to_date(strict=False, format=None)
            if parsed.null_count() < df.height * 0.3:
                date_columns.append(candidate)

    # Measures ordered by business-semantic priority (revenue first), with
    # remaining declared measures appended in schema order.
    ranked = sorted(
        [p for p in profiles if p.role == "measure" and not getattr(p, "isIdentifier", False)],
        key=_measure_priority,
    )
    measure_columns: list[str] = [p.name for p in ranked if p.semanticType not in ("unknown", None)]
    for p in ranked:
        if p.name not in measure_columns:
            measure_columns.append(p.name)

    trends: list[TrendAnalysis] = []

    for date_col in date_columns[:2]:
        for metric_col in measure_columns[:3]:
            if len(trends) >= max_series:
                break

            work = df.select(
                [
                    pl.col(date_col).cast(pl.Utf8).str.to_date(strict=False).alias("_date"),
                    pl.col(metric_col).cast(pl.Float64, strict=False).alias("_value"),
                ]
            ).drop_nulls()

            if work.height < 10:
                continue

            span = (work["_date"].max() - work["_date"].min()).days  # type: ignore[operator]
            if span is None or span < 7:
                continue

            granularity = _choose_granularity(float(span))
            grouped = (
                work.with_columns(_to_period_expr(granularity).alias("_period"))
                .group_by("_period")
                .agg([pl.col("_value").sum().alias("value"), pl.col("_date").min().alias("_min"), pl.col("_date").max().alias("_max")])
                .sort("_min")
                .drop_nulls()
            )

            # ── Partial-bucket guard ────────────────────────────────────
            # A trailing bucket whose date coverage ends early (dataset ends
            # mid-week/month) produces an artificial trough right before any
            # forecast — trim it.
            warnings: list[str] = []
            last_period_complete = True
            if grouped.height >= 2 and granularity in ("week", "month", "quarter", "year"):
                last_row = grouped.tail(1).to_dicts()[0]
                actual_end = last_row["_max"]
                if isinstance(actual_end, date):
                    if granularity == "week":
                        min_d = last_row["_min"]
                        expected_end = (
                            min_d + timedelta(days=6)
                            if isinstance(min_d, date)
                            else None
                        )
                        gap_days = (expected_end - actual_end).days if expected_end else 0
                    else:
                        expected_end = _period_end(str(last_row["_period"]), granularity)
                        gap_days = (expected_end - actual_end).days if expected_end else 0
                    if gap_days > 1:
                        grouped = grouped.head(grouped.height - 1)
                        last_period_complete = False
                        warnings.append(
                            f"Final {granularity} bucket '{last_row['_period']}' was incomplete "
                            f"(data ends {actual_end}); excluded to avoid a misleading trough before the forecast."
                        )

            if grouped.height < 5:
                continue

            periods = grouped["_period"].to_list()
            values = [float(v) for v in grouped["value"].to_list()]

            direction, direction_label = _classify(values)

            total_span = abs(sum(values)) or 1.0
            change_total = values[-1] - values[0]
            change_pct = (change_total / abs(values[0]) * 100.0) if values[0] != 0 else None

            # Seasonality proxy: autocorrelation at estimated cycle lag.
            seasonality = False
            note: str | None = None
            mean_abs = abs(sum(values) / len(values)) or 1.0
            rel_std = float(np.std(values)) / mean_abs
            if len(values) >= 14 and granularity in ("day", "week", "month") and rel_std <= VOLATILITY_THRESHOLD:
                centered = np.array(values) - np.mean(values)
                denom = float(np.dot(centered, centered)) or 1.0
                lag = 7 if granularity in ("day", "week") else 12
                if len(centered) > lag:
                    r = float(np.dot(centered[:-lag], centered[lag:]) / denom)
                    if r > 0.4:
                        seasonality = True
                        note = f"Repeating pattern detected with a {lag}-period cycle (autocorrelation {r:.2f})."

            series_points = [TimeSeriesPoint(period=str(p), value=round(v, 4)) for p, v in zip(periods, values)]
            ma7 = (
                [TimeSeriesPoint(period=str(p), value=round(v, 4)) for p, v in zip(periods, _moving_average(values, 7))]
                if len(values) >= 7
                else []
            )
            ma30 = (
                [TimeSeriesPoint(period=str(p), value=round(v, 4)) for p, v in zip(periods, _moving_average(values, 30))]
                if len(values) >= 30
                else []
            )

            trends.append(
                TrendAnalysis(
                    metricColumn=metric_col,
                    dateColumn=date_col,
                    granularity=granularity,  # type: ignore[arg-type]
                    series=series_points[:400],
                    direction=direction,  # type: ignore[arg-type]
                    directionLabel=direction_label,
                    changePercentage=round(change_pct, 2) if change_pct is not None else None,
                    volatilityCoefficient=round(rel_std, 3),
                    movingAverage7=ma7,
                    movingAverage30=ma30,
                    seasonalityDetected=seasonality,
                    seasonalityNote=note,
                    insight=_build_insight(metric_col, [str(p) for p in periods], values, direction, seasonality)[:600],
                    lastPeriodComplete=last_period_complete,
                )
            )

    return trends


def has_valid_time_column(df: pl.DataFrame) -> bool:
    if any(t in (pl.Date, pl.Datetime) for t in df.schema.values()):
        return True
    for col, dtype in df.schema.items():
        if dtype in (pl.String, pl.Utf8):
            sample = df[col].drop_nulls().head(200).cast(pl.String)
            if sample.len() >= 10:
                parsed = sample.str.to_date(strict=False)
                if parsed.is_not_null().sum() >= sample.len() * 0.7:
                    return True
    return False
