"""Automatic dashboard planning with deterministic chart-selection rules.

CHART SELECTION RULES (validated, not AI-generated):
- time  + numeric            -> line / area
- category + numeric         -> bar (pie only when <=6 categories and part-of-whole)
- two numerics               -> scatter
- distribution               -> histogram
- correlation matrix present -> heatmap
- forecast exists            -> forecast chart
- anomalies exist            -> anomaly table/chart
- KPIs                       -> KPI cards
"""
from __future__ import annotations

from typing import Any

import polars as pl

from app.schemas.contract import (
    Anomaly,
    CorrelationPair,
    DashboardPlan,
    DashboardPageSpec,
    DatasetProfile,
    DomainInference,
    Forecast,
    Metric,
    Segment,
    TimeSeriesPoint,
    TrendAnalysis,
    VisualizationSpec,
)
from app.statistics.kpi import compute_top_bottom

MAX_PIE_CATEGORIES = 6


def _kpi_widgets(metrics: list[Metric]) -> list[VisualizationSpec]:
    """Top-of-page KPI cards: headline business metrics first."""
    priority_ids = [
        m
        for m in metrics
        if m.metricId.startswith(("total_revenue", "total_orders", "unique_customers", "avg_order_value", "row_count", "total_"))
        and m.value is not None
    ]
    secondary = [m for m in metrics if m.metricId.startswith("avg_") and m.value is not None]
    seen: set[str] = set()
    chosen: list[Metric] = []
    for m in priority_ids[:6] + secondary[:2]:
        if m.metricId not in seen:
            seen.add(m.metricId)
            chosen.append(m)
    return [
        VisualizationSpec(
            id=f"kpi_{m.metricId}",
            type="kpi",
            title=m.label,
            insightText=(
                f"Computed from {m.provenance.rowsUsed:,} rows"
                + (f"; {m.provenance.nullsExcluded:,} rows excluded for missing values." if m.provenance.nullsExcluded else ".")
                if m.provenance.nullsExcluded or m.provenance.rowsUsed
                else None
            ),
            data={
                "value": m.value,
                "unit": m.unit,
                "metricId": m.metricId,
                "aggregation": m.provenance.aggregation,
                "sourceColumns": m.provenance.sourceColumns,
                "rowsUsed": m.provenance.rowsUsed,
                "nullsExcluded": m.provenance.nullsExcluded,
            },
        )
        for m in chosen[:6]
    ]


def _trend_widget(trend: TrendAnalysis) -> VisualizationSpec:
    change = f" ({trend.changePercentage:+.1f}%)" if trend.changePercentage is not None else ""
    return VisualizationSpec(
        id=f"line_{trend.metricColumn}_{trend.dateColumn}".replace(" ", "_").replace(".", "_"),
        type="area",
        title=f"{trend.metricColumn} over time",
        subtitle=f"{trend.directionLabel} · by {trend.granularity}{change}",
        selectionReason="Time dimension + measure → line/area chart.",
        insightText=trend.insight or trend.seasonalityNote,
        data={
            "series": [{"period": p.period, "value": p.value} for p in trend.series],
            "movingAverage": [{"period": p.period, "value": p.value} for p in trend.movingAverage7],
            "direction": trend.direction,
            "directionLabel": trend.directionLabel,
            "granularity": trend.granularity,
            "lastPeriodComplete": trend.lastPeriodComplete,
        },
    )


def _category_bar(
    df: pl.DataFrame,
    profiles: list[Any],
    max_categories: int = 15,
) -> VisualizationSpec | None:
    """Best categorical dimension x strongest measure → bar chart."""
    dims = [p.name for p in profiles if p.role == "dimension"]
    measures = [p.name for p in profiles if p.role == "measure" and p.inferredType != "identifier"]
    if not dims or not measures:
        return None

    dim, measure = dims[0], measures[0]
    grouped = (
        df.group_by(dim)
        .agg([pl.col(measure).cast(pl.Float64, strict=False).sum().alias("_total")])
        .drop_nulls()
        .sort("_total", descending=True)
        .head(max_categories)
    )
    if grouped.height < 1:
        return None

    categories = [str(r[0])[:40] for r in grouped.iter_rows()]
    values = [round(float(r[1]), 4) if r[1] is not None else 0 for r in grouped.iter_rows()]

    use_pie = len(categories) <= MAX_PIE_CATEGORIES and all(v >= 0 for v in values)
    total = sum(values)
    if use_pie and total > 0 and min(values) / total < 0.02:
        use_pie = False  # Dominated by slivers — pie would mislead.

    top_share = (values[0] / total * 100.0) if total else None
    insight = (
        f"'{categories[0]}' leads with {top_share:.1f}% of total {measure}."
        if top_share is not None
        else None
    )

    return VisualizationSpec(
        id=f"bar_{dim}_{measure}".replace(" ", "_").replace(".", "_"),
        type="pie" if use_pie else "bar",
        title=f"{measure} by {dim}" + (" (share of total)" if use_pie else ""),
        selectionReason=(
            f"Category ({dim}, {len(categories)} values) + measure ({measure}) → "
            + ("pie: few mutually-exclusive parts of a whole." if use_pie else "bar chart.")
        ),
        insightText=insight,
        data={"categories": categories, "values": values},
    )


def _histogram_widget(profiles: list[Any]) -> VisualizationSpec | None:
    for p in profiles:
        if p.histogram:
            return VisualizationSpec(
                id=f"hist_{p.name}".replace(" ", "_"),
                type="histogram",
                title=f"Distribution of {p.name}",
                subtitle=f"median={p.median:,.2f}" if p.median is not None else None,
                selectionReason="Single numeric distribution → histogram.",
                data={"buckets": p.histogram or []},
            )
    return None


def _scatter_widget(df: pl.DataFrame, correlations: list[CorrelationPair]) -> VisualizationSpec | None:
    if not correlations:
        return None
    pair = correlations[0]
    sub = df.select([pl.col(pair.columnA).cast(pl.Float64, strict=False), pl.col(pair.columnB).cast(pl.Float64, strict=False)]).drop_nulls()
    n = min(sub.height, 2000)
    sub = sub.head(n)
    points = [
        {"x": round(float(a), 4), "y": round(float(b), 4)}
        for a, b in sub.iter_rows()
        if a is not None and b is not None
    ]
    if len(points) < 10:
        return None
    return VisualizationSpec(
        id=f"scatter_{pair.columnA}_{pair.columnB}".replace(" ", "_"),
        type="scatter",
        title=f"{pair.columnA} vs {pair.columnB}",
        subtitle=f"{pair.method} r={pair.coefficient:.2f} (n={pair.sampleSize}) — correlation ≠ causation",
        selectionReason="Two correlated numeric measures → scatter plot.",
        data={"points": points, "correlation": pair.model_dump()},
    )


def _correlation_heatmap(correlations: list[CorrelationPair]) -> VisualizationSpec | None:
    if len(correlations) < 3:
        return None
    columns = sorted({c.columnA for c in correlations[:20]} | {c.columnB for c in correlations[:20]})
    matrix: dict[str, dict[str, float | None]] = {c: {} for c in columns}
    lookup = {(c.columnA, c.columnB): c.coefficient for c in correlations}
    lookup.update({(c.columnB, c.columnA): c.coefficient for c in correlations})
    for a in columns:
        for b in columns:
            if a == b:
                matrix[a][b] = 1.0
            else:
                matrix[a][b] = lookup.get((a, b))
    return VisualizationSpec(
        id="corr_heatmap",
        type="heatmap",
        title="Correlation matrix",
        subtitle="Pearson/Spearman coefficients; blank = below reporting threshold",
        selectionReason="Multiple pairwise correlations → heatmap.",
        data={"columns": columns, "matrix": matrix},
    )


def _forecast_widgets(forecasts: list[Forecast]) -> list[VisualizationSpec]:
    widgets = []
    for f in forecasts[:2]:
        mape = f.fitMetrics.get("mape")
        baseline = f.fitMetrics.get("baselineMape")
        if mape is not None:
            subtitle = f"{f.model} · holdout MAPE {mape:.0f}%"
            if baseline is not None:
                subtitle += f" vs naive baseline {baseline:.0f}%"
            subtitle += f" · confidence {f.confidence}"
        else:
            subtitle = f.model
        widgets.append(
            VisualizationSpec(
                id=f"forecast_{f.metricColumn}".replace(" ", "_").replace(".", "_"),
                type="forecast",
                title=f"{f.metricColumn} forecast (+{f.horizonPeriods} {f.granularity}s)",
                subtitle=subtitle,
                selectionReason="Validated forecast exists → history + projection chart with uncertainty band.",
                insightText="Shaded band shows approximate uncertainty that widens with horizon; forecasts are estimates, not guarantees.",
                data={
                    "history": [{"period": p.period, "value": p.value} for p in f.history],
                    "predictions": f.predictions,
                    "model": f.model,
                    "confidence": f.confidence,
                },
            )
        )
    return widgets


def _segment_widget(segments: list[Segment]) -> VisualizationSpec | None:
    if not segments:
        return None
    return VisualizationSpec(
        id="segments_bar",
        type="bar",
        title="Customer/data segments",
        subtitle=segments[0].label,
        selectionReason="Discrete segment sizes → horizontal bar comparison.",
        data={
            "categories": [s.label for s in segments],
            "values": [s.sizePercentage for s in segments],
            "sizes": [s.size for s in segments],
            "method": segments[0].method,
        },
    )


def _anomaly_widget(anomalies: list[Anomaly]) -> VisualizationSpec | None:
    if not anomalies:
        return None
    statistical = sum(1 for a in anomalies if a.classification == "statistical_outlier")
    notable = len(anomalies) - statistical
    rows = [
        {
            "column": a.column,
            "rowIndex": a.rowIndex,
            "value": a.value,
            "method": a.method,
            "severity": a.severity,
            "classification": a.classification,
            "explanation": a.explanation,
        }
        for a in anomalies[:50]
    ]
    return VisualizationSpec(
        id="anomalies_table",
        type="anomaly_chart",
        title=f"Notable outliers ({len(anomalies)} detected)",
        subtitle=(
            f"{statistical} statistical · {notable} business-plausible — statistical flags are not data errors"
        ),
        selectionReason="Flagged outlier records → anomaly table for review.",
        data={"rows": rows},
    )


def _quality_text(profile: DatasetProfile, findings: list[Any]) -> VisualizationSpec:
    high = [f for f in findings if f.severity == "high"]
    text = (
        f"Data quality score: {profile.qualityScore}/100. "
        f"{profile.rowCount:,} rows × {profile.columnCount} columns; "
        f"{profile.missingCellPercentage:.1f}% missing cells; {profile.duplicateRowCount:,} duplicate rows"
        + (f"; {len(high)} high-severity issues need attention." if high else "; no critical quality issues.")
    )
    return VisualizationSpec(
        id="quality_note",
        type="text",
        title="Dataset health",
        data={"text": text, "qualityScore": profile.qualityScore},
    )


def build_dashboard_plan(
    df: pl.DataFrame,
    profile: DatasetProfile,
    domain: DomainInference,
    metrics: list[Metric],
    trends: list[TrendAnalysis],
    anomalies: list[Anomaly],
    correlations: list[CorrelationPair],
    forecasts: list[Forecast],
    segments: list[Segment],
    findings: list[Any],
    dataset_name: str,
) -> DashboardPlan:
    overview_widgets: list[VisualizationSpec] = []
    overview_widgets.extend(_kpi_widgets(metrics))
    overview_widgets.append(_quality_text(profile, findings))

    for trend in trends[:2]:
        overview_widgets.append(_trend_widget(trend))

    bar_widget = _category_bar(df, profile.columns)
    if bar_widget:
        overview_widgets.append(bar_widget)

    hist_widget = _histogram_widget(profile.columns)
    if hist_widget:
        overview_widgets.append(hist_widget)

    detail_page: DashboardPageSpec | None = None
    detail_widgets: list[VisualizationSpec] = []

    scatter = _scatter_widget(df, correlations)
    if scatter:
        detail_widgets.append(scatter)

    heatmap = _correlation_heatmap(correlations)
    if heatmap:
        detail_widgets.append(heatmap)

    detail_widgets.extend(_forecast_widgets(forecasts))

    seg_widget = _segment_widget(segments)
    if seg_widget:
        detail_widgets.append(seg_widget)

    anomaly_widget = _anomaly_widget(anomalies)
    if anomaly_widget:
        detail_widgets.append(anomaly_widget)

    top_bottom = compute_top_bottom(df, profile.columns, "")
    if top_bottom:
        detail_widgets.append(
            VisualizationSpec(
                id="top_bottom_table",
                type="table",
                title=f"Top & bottom performers by {top_bottom['measure']} per {top_bottom['dimension']}",
                selectionReason="Ranked aggregates → table preserves exact ordering.",
                data={
                    "columns": [top_bottom["dimension"], f"Total {top_bottom['measure']}"],
                    "topRows": top_bottom["topRows"],
                    "bottomRows": top_bottom["bottomRows"],
                },
            )
        )

    pages: list[DashboardPageSpec] = [DashboardPageSpec(title="Overview", widgets=overview_widgets)]
    if detail_widgets:
        pages.append(DashboardPageSpec(title="Deep Dive", widgets=detail_widgets))

    return DashboardPlan(
        title=f"{dataset_name} — {domain.domain.replace('_', ' ').title()} Dashboard",
        pages=pages,
    )
