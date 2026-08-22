"""Deterministic, plan-driven KPI computation.

Metrics are computed FROM the analysis plan: a KPI is only calculated when its
planned source fields actually exist. Every metric carries provenance —
source paths, aggregation, rows used and nulls excluded — so partial data is
explicit instead of silently ignored.
"""
from __future__ import annotations

from typing import Any

import polars as pl

from app.schemas.contract import AnalysisPlan, Metric, MetricProvenance, PlannedKpi

CANCELLED_VOCAB = {"cancelled", "canceled"}
RETURNED_VOCAB = {"returned", "refunded"}


def _numeric(series: pl.Series) -> pl.Series:
    if series.dtype in (pl.String, pl.Utf8):
        return (
            series.cast(pl.String)
            .str.replace_all(r"[$€£¥,\s%]", "", literal=False)
            .cast(pl.Float64, strict=False)
        )
    return series.cast(pl.Float64, strict=False)


def _agg(df: pl.DataFrame, path: str, aggregation: str) -> tuple[float | None, int, int]:
    """Returns (value, rowsUsed, nullsExcluded)."""
    total_rows = df.height

    # Count-style aggregations operate on raw values — numeric casting would
    # destroy non-numeric identifiers like "ORD-00042".
    if aggregation == "COUNT":
        return float(total_rows), total_rows, 0
    if aggregation == "COUNT_DISTINCT":
        valid_raw = df[path].drop_nulls()
        return float(valid_raw.n_unique()), int(valid_raw.len()), total_rows - int(valid_raw.len())

    series = _numeric(df[path])
    valid = series.drop_nulls()
    nulls_excluded = total_rows - valid.len()

    value: float | None
    if aggregation == "SUM":
        value = float(valid.sum()) if valid.len() else None
    elif aggregation == "MEAN":
        value = float(valid.mean()) if valid.len() else None
    elif aggregation == "MEDIAN":
        value = float(valid.median()) if valid.len() else None
    elif aggregation == "MIN":
        value = float(valid.min()) if valid.len() else None
    elif aggregation == "MAX":
        value = float(valid.max()) if valid.len() else None
    elif aggregation == "RATIO":
        value = float(valid.sum()) if valid.len() else None
    else:
        value = None
    return value, int(valid.len()), int(nulls_excluded)


def _status_share(df: pl.DataFrame, path: str, vocab: set[str]) -> tuple[float | None, int, int]:
    col = df[path].cast(pl.String).str.strip_chars().str.to_lowercase()
    flagged = int(col.is_in(sorted(vocab)).fill_null(False).sum())
    known = int(col.is_not_null().sum())
    if not known:
        return None, 0, df.height - known
    share = flagged / known * 100.0
    return round(share, 2), known, df.height - known


def _ratio_kpi(
    df: pl.DataFrame,
    kpi: PlannedKpi,
    dataset_version: str,
) -> Metric | None:
    num_path = kpi.sourcePaths[0] if kpi.sourcePaths else None
    den_paths = kpi.denominatorPaths or []
    den_path = den_paths[0] if den_paths else None

    if not num_path:
        return None

    if kpi.key in ("cancellation_rate", "return_rate"):
        vocab = CANCELLED_VOCAB if kpi.key == "cancellation_rate" else RETURNED_VOCAB
        value, rows_used, nulls_excluded = _status_share(df, num_path, vocab)
        calc = f"{kpi.label} = share of rows with status in {sorted(vocab)}"
    elif kpi.key == "click_through_rate":
        clicks, rows_used, nulls_excluded = _agg(df, num_path, "SUM")
        impressions, _, _ = _agg(df, den_path, "SUM")
        value = round(clicks / impressions * 100.0, 4) if clicks is not None and impressions else None
        calc = "CTR = clicks / impressions × 100"
    else:
        numerator, rows_used, nulls_excluded = _agg(df, num_path, "SUM")
        denominator, den_rows, _den_nulls = _agg(df, den_path, "COUNT_DISTINCT")
        value = round(numerator / denominator, 4) if numerator is not None and denominator else None
        calc = f"{num_path} sum ÷ distinct {den_path}"

    if value is None:
        return None

    return Metric(
        metricId=kpi.key,
        label=kpi.label,
        value=value,
        unit=kpi.unit,
        datasetVersion=dataset_version,
        provenance=MetricProvenance(
            aggregation="RATIO",
            sourceColumns=[p for p in (num_path, den_path) if p],
            algorithm=calc,
            rowsUsed=rows_used,
            nullsExcluded=nulls_excluded,
        ),
    )


def compute_kpis_from_plan(
    df: pl.DataFrame,
    plan: AnalysisPlan,
    dataset_version: str,
) -> list[Metric]:
    metrics: list[Metric] = []

    for kpi in plan.kpis:
        try:
            if not kpi.available:
                continue

            if kpi.aggregation == "RATIO":
                metric = _ratio_kpi(df, kpi, dataset_version)
                if metric:
                    metrics.append(metric)
                continue

            if kpi.aggregation == "COUNT" and not kpi.sourcePaths:
                metrics.append(
                    Metric(
                        metricId=kpi.key,
                        label=kpi.label,
                        value=float(df.height),
                        unit=kpi.unit,
                        datasetVersion=dataset_version,
                        provenance=MetricProvenance(aggregation="COUNT", sourceColumns=[], rowsUsed=df.height),
                    )
                )
                continue

            path = kpi.sourcePaths[0]
            value, rows_used, nulls_excluded = _agg(df, path, kpi.aggregation)
            if value is None:
                continue

            display_value = value
            if kpi.unit == "%" and kpi.key.startswith("avg_") and abs(value) <= 1.5:
                display_value = value * 100.0  # fraction stored rates → percent for presentation

            metrics.append(
                Metric(
                    metricId=kpi.key,
                    label=kpi.label,
                    value=round(display_value, 4),
                    unit=kpi.unit,
                    datasetVersion=dataset_version,
                    provenance=MetricProvenance(
                        aggregation=kpi.aggregation,  # type: ignore[arg-type]
                        sourceColumns=[path],
                        rowsUsed=rows_used,
                        nullsExcluded=nulls_excluded,
                    ),
                )
            )
        except Exception as exc:  # one broken KPI must not kill the rest
            metrics.append(
                Metric(
                    metricId=f"{kpi.key}_error",
                    label=f"{kpi.label} (unavailable)",
                    value=None,
                    unit=None,
                    datasetVersion=dataset_version,
                    provenance=MetricProvenance(
                        aggregation="MODEL",
                        sourceColumns=kpi.sourcePaths[:1],
                        algorithm=f"computation failed: {exc}",
                    ),
                )
            )

    return metrics[:40]


# ── Legacy helpers retained for report/dashboard composition ────────────────


def _resolve_semantic(profiles: list[Any], semantic_types: tuple[str, ...]) -> str | None:
    for p in profiles:
        if getattr(p, "semanticType", None) in semantic_types:
            return p.name
    return None


def compute_top_bottom(
    df: pl.DataFrame,
    profiles: list[Any],
    dataset_version: str,
) -> dict[str, Any] | None:
    """Top/bottom performer tables for the strongest dimension-measure pair."""
    dimension = _resolve_semantic(profiles, ("category", "product", "location", "channel"))
    measure = _resolve_semantic(profiles, ("revenue", "quantity"))

    if dimension is None:
        dims = [p.name for p in profiles if p.role == "dimension"]
        dimension = dims[0] if dims else None
    if measure is None:
        measures = [p.name for p in profiles if p.role == "measure" and getattr(p, "inferredType", "") != "identifier"]
        measure = measures[0] if measures else None

    if not dimension or not measure or dimension == measure:
        return None
    if df.height < 5:
        return None

    grouped = (
        df.group_by(dimension)
        .agg([pl.col(measure).cast(pl.Float64, strict=False).sum().alias("_total")])
        .drop_nulls()
        .sort("_total", descending=True)
    )
    if grouped.height < 2:
        return None

    k = min(5, grouped.height)
    top = grouped.head(k)
    bottom = grouped.tail(k)

    def to_rows(frame: pl.DataFrame) -> list[list[str]]:
        return [
            [str(r[0])[:60], f"{r[1]:,.2f}"]
            for r in frame.iter_rows()
        ]

    return {
        "dimension": dimension,
        "measure": measure,
        "topRows": to_rows(top),
        "bottomRows": to_rows(bottom),
    }


def compute_performance_drivers(
    correlations: list[Any],
    segments: list[Any],
) -> list[str]:
    drivers: list[str] = []
    for c in sorted(correlations, key=lambda x: -abs(x.coefficient))[:5]:
        if abs(c.coefficient) >= 0.5:
            direction = "positively" if c.coefficient > 0 else "negatively"
            drivers.append(
                f"{c.columnA} is {direction} correlated with {c.columnB} (r={c.coefficient:.2f}, n={c.sampleSize}). Correlation does not imply causation."
            )
    for s in segments[:3]:
        drivers.append(f"Segment \"{s.label}\" contains {s.sizePercentage:.1f}% of records ({s.method}).")
    return drivers
