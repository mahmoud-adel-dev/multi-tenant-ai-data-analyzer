"""Deterministic analysis planning.

Runs AFTER schema inference + semantics and BEFORE any metric computation.
Decides WHAT is worth calculating for this specific dataset: which KPIs are
supported by the available fields, which dimensions/measures/time columns to
use, which anomaly methods fit, and whether forecasting is justified.

Every planned KPI records its required source paths so missing inputs become
explicit "unavailable" entries instead of silently skipped or fabricated
metrics.
"""
from __future__ import annotations

from typing import Iterable

from app.schemas.contract import AnalysisPlan, ColumnProfile, DatasetProfile, DomainInference, PlannedKpi

MAX_KPIS = 12
MAX_DIMENSIONS = 12

# Ordered revenue-path preference — first available path wins.
REVENUE_PATHS = ["pricing.total", "pricing.total_amount", "revenue", "net_sales", "gmv", "sales", "total_amount", "amount"]
ORDER_PATHS = ["order_id", "order.number", "sale_id", "invoice_no", "transaction_id"]
CUSTOMER_PATHS = ["customer.customer_id", "customer_id", "customer.email", "email", "client_id"]
QUANTITY_PATHS = ["quantity", "qty", "units"]
UNIT_PRICE_PATHS = ["pricing.unit_price", "unit_price", "price"]
DISCOUNT_RATE_PATHS = ["pricing.discount_rate", "discount_rate", "discount.pct"]
TAX_PATHS = ["pricing.tax_amount", "tax_amount", "tax"]
SHIPPING_COST_PATHS = ["shipping.shipping_cost", "shipping.cost", "shipping_cost", "freight"]
DELIVERY_DAYS_PATHS = ["shipping.delivery_days", "delivery_days", "lead_time"]
MARGIN_PATHS = ["metrics.profit_margin", "profit_margin", "margin", "gross_margin"]
STATUS_PATHS = ["payment.status", "order.status", "status", "state"]
SEGMENT_PATHS = ["customer.segment", "segment", "tier"]


def _by_semantic(profile: DatasetProfile) -> dict[str, list[ColumnProfile]]:
    index: dict[str, list[ColumnProfile]] = {}
    for col in profile.columns:
        if col.semanticType:
            index.setdefault(col.semanticType, []).append(col)
    return index


def _resolve(paths: Iterable[str], by_name: dict[str, ColumnProfile]) -> tuple[list[str], list[str]]:
    """Splits candidate paths into (present, missing)."""
    present = [p for p in paths if p in by_name]
    return present, [p for p in paths if p not in by_name]


def _kpi(
    key: str,
    label: str,
    aggregation: str,
    source_paths: list[str],
    by_name: dict[str, ColumnProfile],
    *,
    denominator_paths: list[str] | None = None,
    unit: str | None = None,
    rationale: str = "",
) -> PlannedKpi:
    present, missing = _resolve(source_paths, by_name)
    denom_present: list[str] = []
    if denominator_paths:
        denom_present, denom_missing = _resolve(denominator_paths, by_name)
        missing = missing + denom_missing
    available = (bool(present) or not source_paths) and (
        not denominator_paths or bool(denom_present)
    )
    return PlannedKpi(
        key=key,
        label=label,
        aggregation=aggregation,  # type: ignore[arg-type]
        sourcePaths=present,
        denominatorPaths=denom_present,
        unit=unit,
        available=available,
        missingPaths=missing[:4],
        rationale=rationale,
    )


def _time_columns(profile: DatasetProfile) -> list[str]:
    cols: list[str] = []
    for c in profile.columns:
        if c.inferredType in ("date", "datetime"):
            cols.append(c.name)
        elif (
            c.inferredType == "categorical"
            and any(tok in c.normalizedName for tok in ("date", "month", "week", "timestamp"))
        ):
            cols.append(c.name)  # string-encoded dates; parser will verify
    return cols


def build_analysis_plan(profile: DatasetProfile, domain: DomainInference) -> AnalysisPlan:
    by_name = {c.name: c for c in profile.columns}
    sem = _by_semantic(profile)

    measures = [
        c.name
        for c in profile.columns
        if c.role == "measure" and not c.isIdentifier and c.uniqueCount > 1
    ]
    dimensions = [
        c.name
        for c in profile.columns
        if c.role == "dimension"
        and not c.isEmail
        and 1 < c.uniqueCount <= max(200, profile.rowCount * 0.5)
    ][:MAX_DIMENSIONS]
    identifiers = [c.name for c in profile.columns if c.isIdentifier]
    times = _time_columns(profile)

    sales_like = domain.domain in ("sales", "ecommerce") and domain.confidence >= 0.45
    notes: list[str] = []

    kpis: list[PlannedKpi] = []
    if sales_like:
        kpis.append(_kpi("total_revenue", "Total Revenue", "SUM", REVENUE_PATHS, by_name, unit=None, rationale="Monetary total from detected revenue field."))
        kpis.append(_kpi("total_orders", "Total Orders", "COUNT_DISTINCT", ORDER_PATHS, by_name, rationale="Distinct order references."))
        kpis.append(_kpi("total_units", "Units Sold", "SUM", QUANTITY_PATHS, by_name))
        cust_sources = CUSTOMER_PATHS
        kpis.append(_kpi("unique_customers", "Unique Customers", "COUNT_DISTINCT", cust_sources, by_name))
        kpis.append(_kpi("avg_order_value", "Average Order Value", "RATIO", REVENUE_PATHS, by_name, denominator_paths=ORDER_PATHS, rationale="Revenue divided by distinct orders."))
        kpis.append(_kpi("avg_units_per_order", "Avg Units per Order", "RATIO", QUANTITY_PATHS, by_name, denominator_paths=ORDER_PATHS))
        kpis.append(_kpi("avg_discount_rate", "Avg Discount Rate", "MEAN", DISCOUNT_RATE_PATHS, by_name, unit="%"))
        kpis.append(_kpi("total_tax", "Tax Collected", "SUM", TAX_PATHS, by_name))
        kpis.append(_kpi("shipping_cost_total", "Shipping Cost", "SUM", SHIPPING_COST_PATHS, by_name))
        kpis.append(_kpi("avg_delivery_days", "Avg Delivery Days", "MEAN", DELIVERY_DAYS_PATHS, by_name, unit="days"))
        kpis.append(_kpi("gross_margin_avg", "Avg Gross Margin", "MEAN", MARGIN_PATHS, by_name, unit="%"))

        # Status-derived rates when a status vocabulary column exists.
        status_cols = [c.name for c in sem.get("status", [])]
        if status_cols:
            kpis.append(_kpi("cancellation_rate", "Cancellation Rate", "RATIO", [status_cols[0]], by_name, unit="%",
                             rationale="Share of rows whose status indicates cancellation."))
            kpis.append(_kpi("return_rate", "Return Rate", "RATIO", [status_cols[0]], by_name, unit="%",
                             rationale="Share of rows whose status indicates a return/refund."))

        # Segment cardinality KPI.
        seg_present, seg_missing = _resolve(SEGMENT_PATHS, by_name)
        if seg_present:
            kpis.append(_kpi("unique_segments", "Customer Segments", "COUNT_DISTINCT", seg_present, by_name))
    else:
        # Generic catalog driven by whatever measures/dimensions exist.
        for col in measures[:4]:
            kpis.append(_kpi(f"total_{col}", f"Total {col}", "SUM", [col], by_name))
            kpis.append(_kpi(f"avg_{col}", f"Average {col}", "MEAN", [col], by_name))
        dim_cols = [c.name for c in profile.columns if c.role == "dimension"][:3]
        for col in dim_cols:
            kpis.append(_kpi(f"unique_{col}", f"Unique {col}", "COUNT_DISTINCT", [col], by_name))

        if domain.domain == "marketing":
            kpis += [
                _kpi("total_spend", "Total Spend", "SUM", ["spend", "cost", "budget"], by_name),
                _kpi("click_through_rate", "CTR", "RATIO", ["clicks"], by_name, denominator_paths=["impressions"], unit="%"),
            ]
        elif domain.domain == "hr":
            kpis.append(_kpi("headcount", "Headcount", "COUNT_DISTINCT", ["employee_id", "employee.id"], by_name))
            kpis.append(_kpi("avg_salary", "Average Salary", "MEAN", ["salary", "compensation"], by_name))
        elif domain.domain == "inventory":
            kpis.append(_kpi("total_stock", "Total Stock", "SUM", ["stock", "stock_quantity", "on_hand"], by_name))
            kpis.append(_kpi("avg_lead_time", "Avg Lead Time", "MEAN", ["lead_time", "replenishment_days"], by_name, unit="days"))

    # Row volume matters for every domain.
    kpis.append(_kpi("row_count", "Total Records", "COUNT", [], by_name, unit="rows"))

    available_kpis = [k for k in kpis if k.available]
    unavailable = [k for k in kpis if not k.available]
    ordered = available_kpis[:MAX_KPIS] + unavailable[:6]

    # Anomaly-method selection by data shape.
    n = profile.rowCount
    numeric_measures = len(measures)
    if n >= 500 and 3 <= min(numeric_measures, 12):
        methods = ["iqr", "robust_zscore", "isolation_forest"]
        anomaly_rationale = f"{n:,} rows with {numeric_measures} numeric measures support multivariate detection."
    elif n >= 30:
        methods = ["iqr", "robust_zscore"]
        anomaly_rationale = "Univariate robust statistics; sample size insufficient for Isolation Forest."
    else:
        methods = ["iqr"]
        anomaly_rationale = "Very small sample; only distribution-range checks applied."

    # Forecast eligibility: needs time column(s), enough rows and enough span.
    forecast_eligible = bool(times) and n >= 60
    forecast_rationale = (
        f"{len(times)} temporal column(s) and {n:,} observations."
        if forecast_eligible
        else ("No usable time dimension detected." if not times else "Too few observations for validated forecasting.")
    )

    segmentation = None
    if sales_like and sem.get("customer_ref") and times:
        segmentation = "rfm"
    elif numeric_measures >= 2 and n >= 30:
        segmentation = "kmeans"

    if unavailable:
        notes.append(
            "Unavailable KPIs are reported with their missing source paths instead of being silently dropped."
        )
    if not times:
        notes.append("No time dimension detected; trend and forecast stages will be skipped.")

    return AnalysisPlan(
        domain=domain.domain,
        domainConfidence=domain.confidence,
        kpis=ordered,
        dimensions=dimensions,
        measures=measures[:16],
        identifiers=identifiers[:8],
        timeColumns=times[:3],
        anomalyMethods=methods,
        anomalyRationale=anomaly_rationale,
        forecastEligible=forecast_eligible,
        forecastRationale=forecast_rationale,
        correlationEligible=len(measures) >= 2,
        segmentationApproach=segmentation,
        notes=notes,
    )
