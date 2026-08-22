"""Semantic field understanding.

Combines three evidence sources per column:
  1. path tokens (``pricing.discount_rate`` -> {pricing, discount, rate})
  2. statistical properties (cardinality, numeric range)
  3. value patterns (status vocabularies, e-mail shape, person-name shape)

Each inference carries a confidence in [0,1]. Rules are additive: agreement
raises confidence; conflicting strong signals lower it. Nothing here mutates
data — this layer only labels fields for the analysis planner.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

import polars as pl

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")
# Person names require 2+ Title-Case words ("Ahmed Hassan") so identifiers
# like "CUST-00042" or "Product 5" cannot masquerade as names.
PERSON_RE = re.compile(r"^[A-Z][a-z]+(?:[\s][A-Z](?:[a-z]+|['\-][A-Z]?[a-z]+)){1,3}$")

# Token vocabulary — concept -> matching tokens (substring match on tokens).
CONCEPT_TOKENS: dict[str, tuple[str, ...]] = {
    "revenue": ("revenue", "sales", "gmv", "net_sales", "line_total", "total_price", "sale_value", "turnover", "subtotal", "total"),
    "duration": ("days", "duration", "lead_time", "hours", "minutes", "weeks"),
    "cost": ("cost", "cogs", "expense"),
    "profit": ("profit", "margin", "net_income"),
    "quantity": ("quantity", "qty", "units", "volume"),
    "price": ("price", "unit_price", "unit_cost", "rate_card"),
    "discount": ("discount", "coupon", "promo"),
    "tax": ("tax", "vat"),
    "shipping": ("shipping", "freight", "carrier", "delivery"),
    "payment": ("payment",),
    "order": ("order",),
    "customer": ("customer", "client", "buyer", "account"),
    "product": ("product", "item", "sku", "article"),
    "category": ("category", "segment", "class", "group"),
    "location": ("region", "territory", "zone", "country", "state", "city", "market", "area", "governorate", "branch"),
    "person": ("salesperson", "sales_rep", "rep", "agent", "seller", "employee", "owner", "manager", "name"),
    "channel": ("channel", "medium", "campaign", "source"),
    "identifier": ("id", "uuid", "guid", "code", "ref", "no", "key"),
    "time": ("date", "datetime", "timestamp", "created_at", "updated_at", "invoice_date", "transaction_date", "shipped_at", "delivered_at"),
    "percentage": ("rate", "pct", "percent", "ratio", "share"),
    "score": ("score", "rating", "stars", "csat", "nps"),
    "status": ("status", "state", "stage"),
}

ORDER_STATUS_VOCAB = {"completed", "pending", "cancelled", "canceled", "shipped", "delivered", "returned", "processing", "refunded", "on_hold", "in_transit"}
PAYMENT_STATUS_VOCAB = {"paid", "unpaid", "pending", "failed", "authorized", "partially_paid"}
GENERIC_STATUS_VOCAB = ORDER_STATUS_VOCAB | PAYMENT_STATUS_VOCAB | {"active", "inactive", "open", "closed", "approved", "rejected", "draft", "enabled", "disabled", "success", "failure"}

# Semantic types that represent additive business measures when numeric.
MEASURE_TYPES = {"revenue", "cost", "profit", "quantity", "price", "discount", "tax", "shipping_cost", "score", "duration"}
DIMENSION_TYPES = {"category", "location", "status", "channel", "payment_method", "person_name", "product", "customer_segment", "customer_ref", "boolean", "temporal"}


@dataclass
class SemanticInfo:
    semanticType: str
    confidence: float
    flags: dict[str, bool] = field(default_factory=dict)


def _path_tokens(name: str) -> set[str]:
    return {tok for tok in re.split(r"[^a-z0-9]+", name.lower()) if tok}


def _token_concepts(tokens: set[str]) -> dict[str, float]:
    """Returns concept -> best token-match strength."""
    found: dict[str, float] = {}
    for concept, concept_tokens in CONCEPT_TOKENS.items():
        best = 0.0
        for ct in concept_tokens:
            if ct in tokens:
                strength = 0.85 if len(ct) >= 5 else 0.7
                # Exact full-token equality is the only match mode we accept,
                # so 'total_price' contributes via its 'price'/'total' parts.
                best = max(best, strength)
        if best:
            found[concept] = best
    return found


def _sample_values(series: pl.Series, k: int = 200) -> list[str]:
    s = series.drop_nulls()
    if s.len() > k * 4:
        s = s.head(k * 4)
    vals = s.cast(pl.String).unique().head(k).to_list()
    return [v for v in vals if v is not None]


def _value_evidence(
    series: pl.Series,
    dtype: pl.DataType,
    inferred: str,
    unique_count: int,
    non_null: int,
) -> tuple[dict[str, float], list[str]]:
    """Value-shape evidence: concept -> confidence contribution, plus notes."""
    evidence: dict[str, float] = {}
    notes: list[str] = []

    if inferred == "boolean":
        evidence["boolean"] = 1.0

    if dtype in (pl.String, pl.Utf8) and non_null:
        sample = _sample_values(series)
        if sample:
            email_hits = sum(1 for v in sample if EMAIL_RE.match(v))
            if email_hits / len(sample) >= 0.8:
                evidence["email"] = 0.95
                notes.append("e-mail shaped values")
            person_hits = sum(1 for v in sample if PERSON_RE.match(v or ""))
            if 0.6 <= person_hits / len(sample) and unique_count > 5:
                evidence["person_name"] = min(0.9, 0.55 + person_hits / len(sample) * 0.3)
                notes.append("title-cased personal-name shapes")
            if unique_count <= 40 and non_null >= 8:
                distinct = [v.lower().strip() for v in sample]
                status_hits = sum(1 for v in distinct if v in GENERIC_STATUS_VOCAB)
                ratio = status_hits / max(1, len(distinct))
                if ratio >= 0.7:
                    evidence["status"] = min(0.92, 0.6 + ratio * 0.35)
                    notes.append("matches known status vocabulary")

    if inferred in ("numeric", "integer") and non_null:
        s = series.drop_nulls().cast(pl.Float64, strict=False).drop_nulls()
        if s.len():
            mn, mx = float(s.min()), float(s.max())
            if -0.001 <= mn and mx <= 1.0001:
                evidence["percentage_0_1"] = 0.55
            elif -0.001 <= mn and mx <= 100.0001:
                evidence["percentage_0_100"] = 0.45

    return evidence, notes


def infer_semantics(
    series: pl.Series,
    *,
    inferred_type: str,
    role: str,
    null_percentage: float,
    unique_count: int,
    row_count: int,
) -> SemanticInfo:
    """Produces the semantic label + confidence + boolean flags for one field."""
    name = series.name
    tokens = _path_tokens(name)
    concepts = _token_concepts(tokens)
    value_ev, _notes = _value_evidence(
        series, series.dtype, inferred_type, unique_count, row_count - int(null_percentage * row_count / 100)
    )

    semantic = "unknown"
    confidence = 0.0

    # Dtype-driven certainties first.
    if inferred_type in ("date", "datetime"):
        semantic, confidence = "temporal", 0.97
    elif inferred_type == "boolean":
        semantic, confidence = "boolean", 1.0
    elif inferred_type == "identifier":
        # High-cardinality IDs keep their business meaning when the path says
        # what they identify (order_id -> order_ref, customer_id -> customer_ref).
        ref_map = {"order": "order_ref", "customer": "customer_ref", "product": "product"}
        hit = next((ref_map[c] for c in ("order", "customer", "product") if c in concepts), None)
        if hit:
            semantic, confidence = hit, 0.85
        else:
            semantic, confidence = "identifier", 0.9
    elif value_ev.get("email"):
        semantic, confidence = "email", value_ev["email"]
    elif value_ev.get("person_name") and "person" in concepts:
        semantic, confidence = "person_name", min(0.95, value_ev["person_name"] + 0.15)
    elif value_ev.get("person_name"):
        semantic, confidence = "person_name", value_ev["person_name"] * 0.8
    elif value_ev.get("status"):
        semantic, confidence = "status", value_ev["status"]
        if "order" in concepts:
            confidence = min(0.95, confidence + 0.05)
    else:
        # Name-driven with value corroboration.
        candidates: dict[str, float] = {}
        for concept, strength in concepts.items():
            mapped = {
                "revenue": "revenue", "cost": "cost", "profit": "profit_margin",
                "quantity": "quantity", "price": "price", "discount": "discount",
                "tax": "tax", "shipping": "shipping_cost", "payment": "payment_method",
                "order": "order_ref", "customer": "customer_ref", "product": "product",
                "category": "category", "location": "location", "person": "person_name",
                "channel": "channel", "identifier": "identifier", "time": "temporal",
                "percentage": "percentage", "score": "score", "status": "status",
                "duration": "duration",
            }.get(concept)
            if mapped:
                candidates[mapped] = max(candidates.get(mapped, 0.0), strength)

        if candidates:
            # Specificity beats generic strength: tax_amount must resolve to
            # tax even though 'amount' also matches revenue.
            specificity = [
                "tax", "discount", "shipping_cost", "profit_margin", "cost",
                "quantity", "duration", "price", "percentage", "score", "status",
                "category", "location", "person_name", "channel",
                "payment_method", "product", "customer_ref", "order_ref",
                "identifier", "temporal", "revenue",
            ]
            best_key = max(
                candidates,
                key=lambda c: (candidates[c], -specificity.index(c) if c in specificity else -99),
            )
            # Prefer more specific concepts when strengths are close.
            top = candidates[best_key]
            near = [c for c, v in candidates.items() if v >= top - 0.2]
            if len(near) > 1:
                ranked = sorted(
                    near,
                    key=lambda c: (specificity.index(c) if c in specificity else 99, -candidates[c]),
                )
                best_key = ranked[0]
            semantic = best_key
            confidence = candidates[semantic]

        # Value corroboration / contradiction.
        if inferred_type not in ("numeric", "integer"):
            if semantic in MEASURE_TYPES | {"percentage"}:
                confidence *= 0.25  # a text column is rarely a measure
        else:
            if semantic in ("category", "location", "status", "channel", "product", "person_name", "payment_method"):
                confidence *= 0.3  # numeric columns rarely categorical dims unless low-cardinality handled by profiler
            if semantic == "percentage":
                if "percentage_0_1" in value_ev or "percentage_0_100" in value_ev:
                    confidence = min(0.95, confidence + 0.2)
                else:
                    confidence *= 0.4
            if semantic in MEASURE_TYPES:
                confidence = min(0.95, confidence + 0.1)

        if confidence < 0.35:
            semantic = "unknown"
            confidence = 0.0

    flags = _derive_flags(semantic, inferred_type, role, confidence)

    # Rate-like semantics on bounded numerics are percentage fields even when
    # a more specific concept won (discount_rate, tax_rate, margin).
    if (
        inferred_type in ("numeric", "integer")
        and semantic in ("percentage", "discount", "profit_margin", "tax")
        and (
            bool(tokens & {"rate", "pct", "percent", "ratio", "margin"})
            or "percentage_0_1" in value_ev
        )
    ):
        flags["isPercentage"] = True

    return SemanticInfo(semanticType=semantic, confidence=round(confidence, 2), flags=flags)


def _derive_flags(semantic: str, inferred: str, role: str, confidence: float) -> dict[str, bool]:
    confident = confidence >= 0.5
    return {
        "isIdentifier": semantic == "identifier",
        "isMeasure": role == "measure",
        "isDimension": role == "dimension",
        "isCurrency": confident and semantic in {"revenue", "cost", "profit", "price", "discount_amount", "tax_amount", "shipping_cost"} and inferred in ("numeric", "integer"),
        "isPercentage": confident and semantic == "percentage" and inferred in ("numeric", "integer"),
        "isLocation": confident and semantic == "location",
        "isPersonName": confident and semantic == "person_name",
        "isEmail": semantic == "email",
        "isStatus": confident and semantic == "status",
        "isDate": inferred == "date",
        "isTime": inferred == "datetime",
        "isNumeric": inferred in ("numeric", "integer"),
        "isCategorical": role == "dimension" and inferred in ("categorical", "text", "string"),
        "isBoolean": inferred == "boolean",
        "isCategory": confident and semantic in {"category", "channel", "payment_method"},
        "isProduct": confident and semantic == "product",
        "isCustomerField": confident and semantic == "customer_ref",
        "isOrderField": confident and semantic in {"order_ref", "temporal"},
    }
