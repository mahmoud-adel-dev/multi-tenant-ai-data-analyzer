"""Professional report generation from verified analytics only.

Language rules enforced here:
  * trend text comes from the measured directionLabel — never hand-written;
  * causal claims are never made ("the available data does not establish…");
  * recommendations are derived from specific findings and clearly separated
    from facts; when evidence is missing, we say so instead of advising.
"""
from __future__ import annotations

from typing import Any

from app.schemas.contract import (
    AnalysisPlan,
    Anomaly,
    CorrelationPair,
    DatasetProfile,
    DomainInference,
    Forecast,
    Metric,
    ReportPlan,
    ReportSectionSpec,
    Segment,
    TrendAnalysis,
)


def _paragraph(text: str) -> dict[str, Any]:
    return {"kind": "paragraph", "text": text}


def _bullets(items: list[str]) -> dict[str, Any]:
    return {"kind": "bullets", "items": items}


def _provenance_suffix(m: Metric) -> str:
    if not m.provenance.rowsUsed:
        return ""
    base = f" — computed from {m.provenance.rowsUsed:,} rows"
    if m.provenance.nullsExcluded:
        base += f" ({m.provenance.nullsExcluded:,} excluded for missing values)"
    return base


def build_report_plan(
    dataset_name: str,
    profile: DatasetProfile,
    domain: DomainInference,
    plan: AnalysisPlan | None,
    metrics: list[Metric],
    trends: list[TrendAnalysis],
    anomalies: list[Anomaly],
    correlations: list[CorrelationPair],
    forecasts: list[Forecast],
    segments: list[Segment],
    findings: list[Any],
    top_bottom: dict[str, Any] | None,
    drivers: list[str],
) -> ReportPlan:
    sections: list[ReportSectionSpec] = []

    # ── 1. Executive summary ────────────────────────────────────────────
    headline_prefixes = ("total_revenue", "total_orders", "unique_customers", "avg_order_value", "total_units", "row_count")
    kpi_lines = [
        f"{m.label}: {m.value:,.2f}{' ' + m.unit if m.unit else ''}{_provenance_suffix(m)}"
        for m in metrics
        if m.metricId.startswith(headline_prefixes) and m.value is not None
    ][:5]
    plan_note = ""
    if plan is not None:
        if plan.domain != "generic_tabular":
            plan_note = (
                f" The engine planned {len([k for k in plan.kpis if k.available])} business KPI(s), "
                f"{len(plan.dimensions)} dimension(s) and {len(plan.timeColumns)} time series for this "
                f"{plan.domain.replace('_', ' ')} dataset."
            )
        else:
            plan_note = " No strong business domain matched, so a generic analysis plan was applied."
    exec_text = (
        f"This report analyzes \"{dataset_name}\", identified as a {domain.domain.replace('_', ' ')} dataset "
        f"(confidence {domain.confidence:.0%}) containing {profile.rowCount:,} records across "
        f"{profile.columnCount} leaf fields, with an evidence-based data-quality score of {profile.qualityScore}/100."
        + plan_note
    )
    sections.append(
        ReportSectionSpec(
            key="executive_summary",
            title="Executive Summary",
            blocks=[_paragraph(exec_text)] + ([_bullets(kpi_lines)] if kpi_lines else []),
        )
    )

    # ── 2. Dataset overview ─────────────────────────────────────────────
    date_cols = [c.name for c in profile.columns if c.role == "date"]
    nested_note = (
        f"; {profile.nestedFieldCount} nested group(s) flattened to leaf paths"
        if profile.nestedFieldCount
        else ""
    )
    overview_blocks: list[dict[str, Any]] = [
        _bullets(
            [
                f"Rows: {profile.rowCount:,}",
                f"Leaf fields analyzed: {profile.columnCount}{nested_note}",
                f"Duplicates: {profile.duplicateRowCount:,} rows",
                f"Missing/blank cells: {profile.missingCellPercentage:.1f}%",
                f"Date fields detected: {', '.join(date_cols[:3]) or 'none'}",
                f"Semantic fields recognized: {', '.join(sorted({c for cols in domain.semanticColumns.values() for c in cols})[:8]) or 'none'}",
            ]
        ),
        {
            "kind": "table",
            "title": "Field summary",
            "columns": ["Field path", "Type", "Semantic", "Confidence", "Nulls %"],
            "rows": [
                [c.name, c.inferredType, c.semanticType or "—", f"{(c.semanticConfidence or 0):.0%}", f"{c.nullPercentage:.1f}"]
                for c in profile.columns[:30]
            ],
        },
    ]
    if plan is not None and plan.notes:
        overview_blocks.append(_bullets([f"Planning note: {n}" for n in plan.notes[:4]]))
    if plan is not None and plan.kpis:
        unavailable = [k for k in plan.kpis if not k.available]
        if unavailable:
            overview_blocks.append(
                _paragraph(
                    "KPIs intentionally NOT calculated (required fields absent): "
                    + "; ".join(f"{k.label} (missing {', '.join(k.missingPaths[:2])})" for k in unavailable[:5])
                    + ". The engine does not fabricate unsupported metrics."
                )
            )
    sections.append(ReportSectionSpec(key="dataset_overview", title="Dataset Overview", blocks=overview_blocks))

    # ── 3. Data quality ─────────────────────────────────────────────────
    quality_blocks: list[dict[str, Any]] = [
        _paragraph(f"Overall data-quality score: {profile.qualityScore}/100, derived from observed missingness, duplication and validation findings below."),
    ]
    if findings:
        quality_blocks.append(
            {
                "kind": "table",
                "title": "Quality findings",
                "columns": ["Severity", "Issue", "Field", "Affected rows", "Suggested remediation"],
                "rows": [
                    [f.severity.upper(), f.issueType, f.column or "—", f"{f.affectedRows:,}", f.suggestedRemediation]
                    for f in findings[:20]
                ],
            }
        )
    else:
        quality_blocks.append(_paragraph("No significant data-quality issues were detected."))
    sections.append(ReportSectionSpec(key="data_quality", title="Data Quality", blocks=quality_blocks))

    # ── 4. Key KPIs with provenance ─────────────────────────────────────
    sections.append(
        ReportSectionSpec(
            key="key_kpis",
            title="Key Performance Indicators",
            blocks=[
                {"kind": "metrics", "metrics": metrics[:12]},
                _paragraph(
                    "Every figure is computed deterministically from the uploaded dataset. Provenance (source field paths, aggregation, rows used) accompanies each metric."
                ),
            ],
        )
    )

    # ── 5. Major trends (label always matches the number) ──────────────
    if trends:
        trend_blocks: list[dict[str, Any]] = []
        for t in trends[:3]:
            change = f"{t.changePercentage:+.1f}%" if t.changePercentage is not None else "n/a"
            text = (
                f"{t.metricColumn} by {t.dateColumn} ({t.granularity}-level): {t.directionLabel}. "
                f"Measured change over the window: {change}"
                + (f". {t.seasonalityNote}" if t.seasonalityNote else ".")
                + "" if t.lastPeriodComplete else " The final period was incomplete and excluded from the series."
            )
            trend_blocks.append(_paragraph(text))
            if t.insight:
                trend_blocks.append(_paragraph(t.insight))
        sections.append(ReportSectionSpec(key="major_trends", title="Major Trends", blocks=trend_blocks))

    # ── 6. Performance drivers ──────────────────────────────────────────
    if drivers:
        sections.append(ReportSectionSpec(key="performance_drivers", title="Performance Drivers", blocks=[_bullets(drivers[:8])]))

    # ── 7. Top/bottom performers ────────────────────────────────────────
    if top_bottom:
        dim, measure = top_bottom["dimension"], top_bottom["measure"]
        sections.append(
            ReportSectionSpec(
                key="top_bottom_performers",
                title="Top & Bottom Performers",
                blocks=[
                    {
                        "kind": "table",
                        "title": f"Top by total {measure} per {dim}",
                        "columns": [dim, f"Total {measure}"],
                        "rows": top_bottom["topRows"],
                    },
                    {
                        "kind": "table",
                        "title": f"Bottom by total {measure} per {dim}",
                        "columns": [dim, f"Total {measure}"],
                        "rows": top_bottom["bottomRows"],
                    },
                ],
            )
        )

    # ── 8. Anomalies (statistical vs business-notable) ─────────────────
    if anomalies:
        statistical = sum(1 for a in anomalies if a.classification == "statistical_outlier")
        notable = len(anomalies) - statistical
        sections.append(
            ReportSectionSpec(
                key="anomalies",
                title="Anomalies & Outliers",
                blocks=[
                    _paragraph(
                        f"{len(anomalies)} outlier flag(s): {statistical} purely statistical, {notable} statistically unusual "
                        "but business-plausible (e.g. bulk orders). A statistical flag does NOT mean a data error."
                    ),
                    {
                        "kind": "table",
                        "title": "Most notable outliers",
                        "columns": ["Field", "Row", "Value", "Method", "Class", "Explanation"],
                        "rows": [
                            [
                                a.column,
                                str(a.rowIndex if a.rowIndex is not None else "—"),
                                f"{a.value:,.2f}",
                                a.method,
                                a.classification,
                                a.explanation,
                            ]
                            for a in anomalies[:15]
                        ],
                    },
                ],
            )
        )

    # ── 9. Correlations ─────────────────────────────────────────────────
    if correlations:
        sections.append(
            ReportSectionSpec(
                key="correlations",
                title="Correlations",
                blocks=[
                    _bullets(
                        [
                            f"{c.columnA} ↔ {c.columnB}: r={c.coefficient:.2f} ({c.method}, n={c.sampleSize}, {c.strength})"
                            for c in correlations[:10]
                        ]
                    ),
                    _paragraph("Correlation measures statistical association only; it does not establish causation."),
                ],
            )
        )

    # ── 10. Forecasts (baseline-accountable) ────────────────────────────
    forecast_blocks: list[dict[str, Any]] = []
    for f in forecasts:
        last_pred = f.predictions[-1] if f.predictions else None
        mape = f.fitMetrics.get("mape")
        baseline = f.fitMetrics.get("baselineMape")
        text = (
            f"{f.metricColumn}: {f.model} projects the next {f.horizonPeriods} {f.granularity}s "
            + (f"ending near {last_pred['value']:,.2f} at {last_pred['period']}." if last_pred else "")
            + (f" Holdout MAPE {mape:.0f}% vs naive baseline {baseline:.0f}% — confidence {f.confidence}." if mape is not None else "")
        )
        forecast_blocks.append(_paragraph(text))
        forecast_blocks.append(_warning_block("Forecasts are estimates with widening uncertainty; they should inform planning, not guarantee outcomes."))
    if forecast_blocks:
        sections.append(ReportSectionSpec(key="forecasts", title="Forecasts", blocks=forecast_blocks))
    elif trends:
        forecast_blocks.append(
            _warning_block(
                "No forecast is shown: the series did not pass validation against a naive baseline, or too few periods exist. "
                "An absent forecast is preferable to an unreliable one."
            )
        )
        sections.append(ReportSectionSpec(key="forecasts", title="Forecasts", blocks=forecast_blocks))

    # ── 11. Segmentation ────────────────────────────────────────────────
    if segments:
        seg_blocks: list[dict[str, Any]] = []
        method = segments[0].method
        seg_blocks.append(
            _paragraph(
                "RFM segmentation groups customers by recency, frequency and monetary value."
                if method == "rfm"
                else "K-means clustering over standardized numeric features (silhouette-guarded)."
            )
        )
        seg_blocks.append(
            {
                "kind": "table",
                "title": "Segments",
                "columns": ["Segment", "Share", "Key characteristics"],
                "rows": [
                    [
                        s.label,
                        f"{s.sizePercentage:.1f}% ({s.size:,})",
                        "; ".join(f"{c.feature}: {c.meanValue:,.2f} vs avg {c.overallMean:,.2f}" for c in s.characteristics[:3]),
                    ]
                    for s in segments[:8]
                ],
            }
        )
        sections.append(ReportSectionSpec(key="segmentation", title="Segmentation Analysis", blocks=seg_blocks))

    # ── 12. Recommendations (evidence-linked, hedged) ───────────────────
    recommendations = _evidence_based_recommendations(metrics, trends, correlations, segments, findings)
    if recommendations:
        sections.append(
            ReportSectionSpec(
                key="recommendations",
                title="Recommendations (evidence-based)",
                blocks=[_bullets(recommendations), _paragraph("Recommendations follow directly from the findings above; they are options to investigate, not guarantees.")],
            )
        )

    # ── 13. Risks & limitations ─────────────────────────────────────────
    risk_items = [
        f"Data-quality score is {profile.qualityScore}/100"
        + (" — review flagged issues before operational decisions." if profile.qualityScore < 70 else "."),
        "All findings describe this dataset snapshot; re-run analysis after new data arrives.",
    ]
    if profile.rowCount < 100:
        risk_items.insert(0, f"Small sample size ({profile.rowCount:,} rows) limits statistical confidence.")
    for f in forecasts:
        risk_items.append(f"Forecast for {f.metricColumn}: {'; '.join(f.warnings[:1])}")
    sections.append(ReportSectionSpec(key="risks_limitations", title="Risks & Limitations", blocks=[_bullets(risk_items)]))

    # ── 14. Methodology ─────────────────────────────────────────────────
    methodology_items = [
        "Nested JSON objects were recursively flattened to leaf field paths before profiling.",
        "Schema inference + semantic labeling assign each field a type, semantic role and confidence score.",
        "An analysis plan selects KPIs/dimensions/methods from available evidence; unsupported KPIs are reported as unavailable rather than fabricated.",
        "KPIs computed as explicit aggregations (SUM/MEAN/MEDIAN/COUNT/COUNT_DISTINCT/RATIO) with row-level provenance.",
        "Trend labels use documented thresholds on the measured change; volatility overrides endpoint readings.",
        "Outlier flags separate statistical outliers from business-plausible extremes.",
        "Forecasts require chronological-holdout validation that beats a naive baseline; otherwise they are withheld.",
        "No LLM was used to compute any number in this report.",
    ]
    sections.append(
        ReportSectionSpec(
            key="methodology",
            title="Methodology",
            blocks=[_bullets(methodology_items)],
        )
    )

    # ── 15. Appendix — full metric provenance ───────────────────────────
    appendix_rows = [
        [
            m.metricId,
            m.label,
            f"{m.value:,.4f}" if m.value is not None else "unavailable",
            m.provenance.aggregation,
            ", ".join(m.provenance.sourceColumns) or "row count",
            str(m.provenance.rowsUsed or ""),
            str(m.provenance.nullsExcluded or ""),
        ]
        for m in metrics
    ]
    sections.append(
        ReportSectionSpec(
            key="appendix",
            title="Appendix: Metric Provenance",
            blocks=[
                {
                    "kind": "table",
                    "title": None,
                    "columns": ["Metric ID", "Label", "Value", "Aggregation", "Source fields", "Rows used", "Excluded"],
                    "rows": appendix_rows,
                }
            ],
        )
    )

    return ReportPlan(title=f"{dataset_name} — Executive Analytics Report", sections=sections)


def _evidence_based_recommendations(
    metrics: list[Metric],
    trends: list[TrendAnalysis],
    correlations: list[CorrelationPair],
    segments: list[Segment],
    findings: list[Any],
) -> list[str]:
    recs: list[str] = []
    by_id = {m.metricId: m for m in metrics}

    aov = by_id.get("avg_order_value")
    units_per_order = by_id.get("avg_units_per_order")
    discount = by_id.get("avg_discount_rate")

    for t in trends:
        if t.direction in ("strong_decline", "moderate_decline"):
            recs.append(
                f"{t.metricColumn} shows {t.directionLabel} across the observed window. Consider investigating which periods/segments drive the decline before drawing conclusions — this data alone does not establish cause."
            )
        elif t.direction == "high_volatility":
            recs.append(
                f"{t.metricColumn} fluctuates heavily period-to-period (relative variability {t.volatilityCoefficient:.2f}). Investigate whether spikes stem from promotions, batching or data gaps."
            )

    if discount is not None and aov is not None and discount.value is not None and aov.value is not None:
        recs.append(
            f"Average discount rate is {discount.value:.1f}% while average order value is {aov.value:,.2f}. Consider analyzing whether discounted orders actually increase basket size before changing pricing policy."
        )
    if units_per_order is not None and units_per_order.value is not None and units_per_order.value < 1.5:
        recs.append(
            f"Orders average only {units_per_order.value:.2f} units. Bundling or cross-sell experiments could raise basket size — validate against this dataset's channel/category splits first."
        )

    strong_corr = [c for c in correlations if c.strength == "strong"][:2]
    for c in strong_corr:
        recs.append(
            f"'{c.columnA}' and '{c.columnB}' move together strongly (r={c.coefficient:.2f}). Worth operational investigation; correlation here is not causation."
        )

    high_sev = [f for f in findings if f.severity == "high"]
    if high_sev:
        cols = sorted({f.column for f in high_sev if f.column})[:3]
        recs.append(
            f"High-severity quality issues affect {', '.join(cols) if cols else 'whole records'}; resolve these before relying on affected metrics."
        )

    top_segment = segments[0] if segments else None
    if top_segment is not None:
        recs.append(
            f"Segment '{top_segment.label}' holds {top_segment.sizePercentage:.1f}% of the population. Consider tailoring treatment for it and reviewing whether its characteristics differ meaningfully from the mean."
        )

    return recs[:8]


def _warning_block(text: str) -> dict[str, Any]:
    return {"kind": "warning", "text": text}
