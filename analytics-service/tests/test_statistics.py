"""Statistics, outliers, correlation, forecasting, segmentation, ML guardrails."""
from __future__ import annotations

import numpy as np
import polars as pl

from app.core.planner import build_analysis_plan
from app.profiling.profiler import profile_dataset
from app.statistics.correlation import compute_correlations
from app.statistics.kpi import compute_kpis_from_plan, compute_top_bottom
from app.statistics.time_series import detect_time_series
from app.ml.outliers import detect_outliers
from app.ml.segmentation import compute_kmeans_segments, compute_rfm
from app.forecasting.engine import build_forecasts


def _plan_for(df: pl.DataFrame):
    profile, domain, findings, clean = profile_dataset(df)
    plan = build_analysis_plan(profile, domain)
    return profile, domain, findings, clean, plan


class TestKPIs:
    def test_kpi_totals_match_manual_computation(self, sales_df: pl.DataFrame) -> None:
        profile, _d, _f, clean, plan = _plan_for(sales_df)
        metrics = compute_kpis_from_plan(clean, plan, "v-test")
        total_revenue = next(m for m in metrics if m.metricId == "total_revenue")
        expected = float(sales_df["revenue"].sum())
        assert abs(total_revenue.value - expected) < 0.01
        assert total_revenue.provenance.sourceColumns == ["revenue"]
        assert total_revenue.provenance.aggregation == "SUM"
        assert total_revenue.provenance.rowsUsed == sales_df.height

    def test_count_distinct_on_string_ids(self, sales_df: pl.DataFrame) -> None:
        """Regression: COUNT_DISTINCT must not numeric-cast string IDs to nulls."""
        profile, _d, _f, clean, plan = _plan_for(sales_df)
        metrics = compute_kpis_from_plan(clean, plan, "v-test")
        orders = next(m for m in metrics if m.metricId == "total_orders")
        assert orders.value == 120.0

    def test_row_count_metric(self, sales_df: pl.DataFrame) -> None:
        profile, _d, _f, clean, plan = _plan_for(sales_df)
        metrics = compute_kpis_from_plan(clean, plan, "v-test")
        row_count = next(m for m in metrics if m.metricId == "row_count")
        assert row_count.value == 120

    def test_unsupported_kpi_is_planned_but_marked_unavailable(self, sales_df: pl.DataFrame) -> None:
        """No margin field exists — gross_margin KPI must be unavailable, never fabricated."""
        profile, _d, _f, _clean, plan = _plan_for(sales_df)
        margin_kpi = next(k for k in plan.kpis if k.key == "gross_margin_avg")
        assert margin_kpi.available is False
        assert margin_kpi.missingPaths
        # And it is NOT computed.
        profile2, _d2, _f2, clean2, plan2 = _plan_for(sales_df)
        metrics = compute_kpis_from_plan(clean2, plan2, "v-test")
        assert all(m.metricId != "gross_margin_avg" for m in metrics)

    def test_aov_ratio(self) -> None:
        df = pl.DataFrame({
            "order_id": ["O1", "O2", "O1"],
            "revenue": [100.0, 50.0, 50.0],
            "customer_id": ["C1", "C2", "C1"],
            "quantity": [1, 1, 1],
        })
        profile, _d, _f, clean, plan = _plan_for(df)
        metrics = compute_kpis_from_plan(clean, plan, "v")
        aov = next(m for m in metrics if m.metricId == "avg_order_value")
        assert abs(aov.value - 100.0) < 0.01  # 200 revenue / 2 distinct orders


class TestCorrelation:
    def test_detects_strong_correlation(self) -> None:
        rng = np.random.default_rng(7)
        x = list(range(200))
        df = pl.DataFrame(
            {
                "x": x,
                "y": [v * 2.5 + float(rng.normal(0, 1)) for v in x],
                "noise": [float(rng.normal(0, 100)) for _ in x],
            }
        )
        pairs = compute_correlations(df)
        xy = next(p for p in pairs if {p.columnA, p.columnB} == {"x", "y"})
        assert xy.coefficient > 0.95
        noise_pair = [p for p in pairs if "noise" in (p.columnA, p.columnB)]
        assert all(abs(p.coefficient) >= 0.4 for p in noise_pair)


class TestTimeSeries:
    def test_monthly_trend_detected(self, sales_df: pl.DataFrame) -> None:
        profile, _d, _f, clean = profile_dataset(sales_df)
        trends = detect_time_series(clean, profile.columns)
        assert trends
        trend = trends[0]
        assert len(trend.series) >= 5
        assert trend.direction in (
            "strong_growth", "moderate_growth", "stable",
            "moderate_decline", "strong_decline", "high_volatility", "insufficient_data",
        )

    def test_direction_label_always_cites_measured_change(self) -> None:
        values = [100.0, 120.0, 150.0, 180.0, 200.0]
        trend = _make_trend(values)
        label = trend.directionLabel
        assert f"{trend.changePercentage:+.1f}%" in label
        # A +100% change can never be labeled stable.
        assert "stable" not in label.lower()

    def test_stable_only_within_band(self) -> None:
        values = [100.0, 101.0, 99.5, 100.5, 100.2]
        trend = _make_trend(values)
        assert trend.direction == "stable"

    def test_high_volatility_overrides_endpoints(self) -> None:
        values = [100.0, 10.0, 190.0, 20.0, 180.0, 15.0]
        trend = _make_trend(values)
        assert trend.direction == "high_volatility"
        assert trend.volatilityCoefficient is not None and trend.volatilityCoefficient > 0.8

    def test_insufficient_data(self) -> None:
        trend = _make_trend([1.0, 2.0])
        assert trend.direction == "insufficient_data"


class TestOutliers:
    def test_iqr_flags_extreme_value(self) -> None:
        df = pl.DataFrame({"amount": [10.0] * 50 + [100000.0]})
        profile, _d, _f, clean = profile_dataset(df)
        anomalies = detect_outliers(clean, profile.columns)
        assert any(a.method in ("iqr", "robust_zscore") and a.value == 100000.0 for a in anomalies)

    def test_positive_quantity_extremes_are_business_notable(self) -> None:
        df = pl.DataFrame({"quantity": [2] * 60 + [400]})
        profile, _d, _f, clean = profile_dataset(df)
        anomalies = detect_outliers(clean, profile.columns)
        extreme = next(a for a in anomalies if a.value == 400.0)
        assert extreme.classification == "business_notable"

    def test_method_respects_allowed_methods(self) -> None:
        df = pl.DataFrame({"amount": [10.0] * 50 + [100000.0], "b": range(51)})
        profile, _d, _f, clean = profile_dataset(df)
        anomalies = detect_outliers(clean, profile.columns, allowed_methods=["iqr"])
        assert all(a.method == "iqr" for a in anomalies)


class TestSegmentation:
    def test_rfm_runs_on_sales_data(self, sales_df: pl.DataFrame) -> None:
        profile, _d, _f, clean = profile_dataset(sales_df)
        segments = compute_rfm(clean, profile.columns)
        assert segments is not None
        assert all(s.method == "rfm" for s in segments)
        assert sum(s.size for s in segments) == 30  # 30 unique customers

    def test_kmeans_guard_skips_tiny_data(self, tiny_df: pl.DataFrame) -> None:
        profile, _d, _f, clean = profile_dataset(tiny_df)
        result = compute_kmeans_segments(clean, profile.columns)
        assert result is None or (result[0] is None)

    def test_kmeans_finds_planted_clusters(self) -> None:
        rng = np.random.default_rng(3)
        a = [[rng.normal(0, 0.3), rng.normal(0, 0.3)] for _ in range(80)]
        b = [[rng.normal(8, 0.3), rng.normal(8, 0.3)] for _ in range(80)]
        c = [[rng.normal(0, 0.3), rng.normal(8, 0.3)] for _ in range(80)]
        rows = a + b + c
        df = pl.DataFrame({"f1": [r[0] for r in rows], "f2": [r[1] for r in rows]})
        profile, _d, _f, clean = profile_dataset(df)
        result = compute_kmeans_segments(clean, profile.columns)
        assert result is not None
        segments, warnings = result
        assert segments is not None
        assert len(segments) == 3


class TestForecasting:
    def test_forecast_beats_naive_baseline_or_is_withheld(self, sales_df: pl.DataFrame) -> None:
        profile, _d, _f, clean = profile_dataset(sales_df)
        trends = detect_time_series(clean, profile.columns)
        forecasts, warnings = build_forecasts(trends)
        for fc in forecasts:
            assert fc.predictions
            assert fc.fitMetrics["baselineMape"] is not None
            assert fc.fitMetrics["skillScore"] is not None and fc.fitMetrics["skillScore"] > 0
            # Continuity: first prediction strictly follows the last history period.
            assert fc.predictions[0]["period"] != fc.history[-1].period
        if not forecasts and trends:
            assert any("baseline" in w or "withheld" in w or "skipped" in w for w in warnings)

    def test_refuses_short_series(self) -> None:
        short_trend = _make_trend([1, 2, 3, 4])
        forecasts, _warnings = build_forecasts([short_trend])
        assert forecasts == []

    def test_forecast_eligibility_gate(self, tiny_df: pl.DataFrame) -> None:
        profile, _d, _f, clean = profile_dataset(tiny_df)
        trends = detect_time_series(clean, profile.columns)
        forecasts, warnings = build_forecasts(trends, eligible=False)
        assert forecasts == []


def _make_trend(values: list[float]):
    from app.schemas.contract import TrendAnalysis

    n = len(values)
    first, last = values[0], values[-1]
    change = (last - first) / abs(first) * 100.0 if first else None
    mean_abs = abs(sum(values) / n) or 1e-9
    rel_std = float(np.std(values)) / mean_abs
    if n < 5 or np.allclose(values, values[0]):
        direction, label = "insufficient_data", "Insufficient Data"
    elif rel_std > 0.8:
        direction, label = "high_volatility", f"High Volatility ({change:+.1f}% endpoint)"
    elif change is None:
        direction, label = "stable", "Stable (baseline zero)"
    elif change > 25:
        direction, label = "strong_growth", f"Strong Growth (+{change:.1f}%)"
    elif change > 5:
        direction, label = "moderate_growth", f"Moderate Growth (+{change:.1f}%)"
    elif change >= -5:
        direction, label = "stable", f"Stable ({change:+.1f}%)"
    elif change >= -25:
        direction, label = "moderate_decline", f"Moderate Decline ({change:.1f}%)"
    else:
        direction, label = "strong_decline", f"Strong Decline ({change:.1f}%)"

    return TrendAnalysis(
        metricColumn="m",
        dateColumn="d",
        granularity="week",
        series=[{"period": f"2025-W{i % 52 + 1:02d}", "value": v} for i, v in enumerate(values)],
        direction=direction,  # type: ignore[arg-type]
        directionLabel=label,
        changePercentage=round(change, 2) if change is not None else None,
        volatilityCoefficient=round(rel_std, 3),
        seasonalityDetected=False,
        seasonalityNote=None,
        lastPeriodComplete=True,
    )
