"""Orchestrates the full deterministic analysis of one dataset.

Pipeline:
  load -> flatten(nested JSON) -> profile+semantics -> quality -> PLAN ->
  KPIs(from plan) -> trends -> correlations(?) -> outliers(planned methods)
  -> segmentation(planned approach) -> forecasts(when justified) ->
  dashboards/reports -> contract payload.
"""
from __future__ import annotations

import platform
import time
import uuid
from typing import Any

import polars as pl

from app.core.config import ENGINE_VERSION
from app.core.loader import load_table
from app.core.planner import build_analysis_plan
from app.forecasting.engine import build_forecasts
from app.ml.outliers import detect_outliers
from app.ml.segmentation import compute_kmeans_segments, compute_rfm
from app.schemas.contract import AnalysisRunPayload, ExecutionStats
from app.profiling.flatten import flatten_frame
from app.profiling.profiler import profile_dataset
from app.reporting.builder import build_report_plan
from app.statistics.correlation import compute_correlations
from app.statistics.kpi import compute_kpis_from_plan, compute_performance_drivers, compute_top_bottom
from app.statistics.time_series import detect_time_series
from app.visualization.planner import build_dashboard_plan


class _StageTimer:
    def __init__(self) -> None:
        self.timings: dict[str, int] = {}
        self._t0 = time.monotonic()

    def mark(self, stage: str) -> None:
        now = time.monotonic()
        self.timings[stage] = int((now - self._t0) * 1000)
        self._t0 = now


def analyze(buffer: bytes, filename: str, file_type: str | None, options: dict[str, Any]) -> dict[str, Any]:
    """Runs the complete pipeline and returns the contract payload as a dict."""
    total_started = time.monotonic()
    timer = _StageTimer()
    warnings: list[str] = []

    loaded = load_table(buffer, file_type)
    timer.mark("load")
    df = loaded.frame
    warnings.extend(loaded.warnings)

    if df.height == 0:
        from app.core.exceptions import MalformedFileError

        raise MalformedFileError("Dataset contains zero rows after parsing.")

    # ── Nested-JSON leaf discovery ──────────────────────────────────────
    flat = flatten_frame(df)
    timer.mark("flatten")
    if flat.dropped_empty_structs:
        warnings.append(f"Dropped {len(flat.dropped_empty_structs)} empty object field(s): {flat.dropped_empty_structs[:5]}")
    if flat.list_columns:
        warnings.append(
            f"{len(flat.list_columns)} array field(s) profiled structurally (no row expansion): {flat.list_columns[:5]}"
        )
    if flat.flattened_paths:
        warnings.append(f"Flattened {len(flat.flattened_paths)} nested leaf fields into dotted paths.")

    df = flat.frame.rename({old: new for old, new in zip(flat.frame.columns, _unique_names(flat.frame.columns))})

    # ── Profile + semantics + quality ───────────────────────────────────
    profile, domain, findings, clean_df = profile_dataset(df, flattened_paths=flat.flattened_paths)
    timer.mark("profile")
    dataset_version = f"v{uuid.uuid5(uuid.NAMESPACE_OID, f'{filename}:{profile.rowCount}:{profile.columnCount}').hex[:12]}"

    # ── Analysis plan BEFORE any metric computation ────────────────────
    plan = build_analysis_plan(profile, domain)
    timer.mark("plan")

    # ── Domain-appropriate analytics ────────────────────────────────────
    metrics = compute_kpis_from_plan(clean_df, plan, dataset_version)
    timer.mark("kpis")

    trends = detect_time_series(clean_df, profile.columns)
    for trend in trends:
        if not trend.lastPeriodComplete:
            warnings.append(f"Trend {trend.metricColumn}: final period was incomplete and excluded.")
    timer.mark("trends")

    correlations = compute_correlations(clean_df) if plan.correlationEligible else []
    timer.mark("correlations")

    anomalies = detect_outliers(clean_df, profile.columns, allowed_methods=plan.anomalyMethods)
    timer.mark("anomalies")

    segments: list[Any] = []
    if plan.segmentationApproach == "rfm":
        rfm = compute_rfm(clean_df, profile.columns)
        if rfm:
            segments.extend(rfm)
        else:
            kmeans_result = compute_kmeans_segments(clean_df, profile.columns)
            if kmeans_result:
                kmeans_segments, kmeans_warnings = kmeans_result
                if kmeans_segments:
                    segments.extend(kmeans_segments)
                warnings.extend(kmeans_warnings)
    elif plan.segmentationApproach == "kmeans":
        kmeans_result = compute_kmeans_segments(clean_df, profile.columns)
        if kmeans_result:
            kmeans_segments, kmeans_warnings = kmeans_result
            if kmeans_segments:
                segments.extend(kmeans_segments)
            warnings.extend(kmeans_warnings)
    else:
        warnings.append("Segmentation skipped: no supported segmentation strategy for this dataset shape.")
    timer.mark("segmentation")

    forecasts, forecast_warnings = build_forecasts(
        trends, eligible=plan.forecastEligible and bool(plan.timeColumns)
    )
    warnings.extend(forecast_warnings)
    timer.mark("forecasts")

    top_bottom = compute_top_bottom(clean_df, profile.columns, dataset_version)
    drivers = compute_performance_drivers(correlations, segments)

    dashboard_plan = build_dashboard_plan(
        clean_df,
        profile,
        domain,
        metrics,
        trends,
        anomalies,
        correlations,
        forecasts,
        segments,
        findings,
        filename,
    )
    report_plan = build_report_plan(
        filename,
        profile,
        domain,
        plan,
        metrics,
        trends,
        anomalies,
        correlations,
        forecasts,
        segments,
        findings,
        top_bottom,
        drivers,
    )
    timer.mark("render_plans")

    payload = AnalysisRunPayload(
        engineVersion=ENGINE_VERSION,
        datasetVersion=dataset_version,
        profile=profile,
        domain=domain,
        analysisPlan=plan,
        metrics=metrics,
        trends=trends,
        anomalies=anomalies[:300],
        correlations=correlations,
        forecasts=forecasts,
        segments=segments[:20],
        qualityFindings=findings[:200],
        dashboardPlan=dashboard_plan,
        reportPlan=report_plan,
        warnings=warnings[:50],
        executionStats=ExecutionStats(
            durationMs=int((time.monotonic() - total_started) * 1000),
            rowsAnalyzed=profile.rowCount,
            columnsAnalyzed=profile.columnCount,
            pythonVersion=platform.python_version(),
            stageTimingsMs=timer.timings,
        ),
    )

    return payload.model_dump(mode="json")


def _unique_names(columns: list[str]) -> list[str]:
    seen: dict[str, int] = {}
    result: list[str] = []
    for col in columns:
        base = col.strip() or "column"
        count = seen.get(base, 0)
        seen[base] = count + 1
        result.append(base if count == 0 else f"{base}_{count + 1}")
    return result
