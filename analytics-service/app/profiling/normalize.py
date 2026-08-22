"""Column normalization and semantic role assignment."""
from __future__ import annotations

import re
from typing import Any

import polars as pl

_SLUG_RE = re.compile(r"[^a-z0-9]+")

# Semantic column vocabulary used by domain inference and KPI selection.
SEMANTIC_PATTERNS: dict[str, list[str]] = {
    "revenue": ["revenue", "sales_amount", "amount", "total", "total_price", "line_total", "gross", "sale_value", "price"],
    "cost": ["cost", "cogs", "expense", "purchase_price", "unit_cost"],
    "profit": ["profit", "margin", "net"],
    "quantity": ["quantity", "qty", "units", "count", "volume"],
    "order_date": ["order_date", "date", "transaction_date", "created_at", "invoice_date", "sale_date"],
    "ship_date": ["ship_date", "shipped_at", "delivery_date"],
    "customer": ["customer", "client", "buyer", "account", "customer_name", "customer_id"],
    "product": ["product", "item", "sku", "product_name", "article"],
    "category": ["category", "product_category", "type", "segment_name", "class"],
    "region": ["region", "territory", "zone", "area", "country", "state", "city", "market"],
    "salesperson": ["salesperson", "rep", "agent", "seller", "employee", "owner"],
    "channel": ["channel", "source", "medium", "campaign"],
    "order_id": ["order_id", "invoice_no", "transaction_id", "receipt"],
}


def normalize_column_name(name: str) -> str:
    slug = _SLUG_RE.sub("_", name.strip().lower())
    return slug.strip("_") or "column"


def match_semantic_role(normalized: str) -> list[str]:
    """Returns all semantic concepts a column name matches (e.g. revenue, customer)."""
    roles: list[str] = []
    for concept, patterns in SEMANTIC_PATTERNS.items():
        for pattern in patterns:
            if pattern == normalized or normalized.endswith(f"_{pattern}") or normalized.startswith(f"{pattern}_"):
                roles.append(concept)
                break
    return roles


def guess_semantic_columns(df: pl.DataFrame) -> dict[str, list[str]]:
    """Maps semantic concept -> matching column names using names + value signals."""
    mapping: dict[str, list[str]] = {}
    for column in df.columns:
        norm = normalize_column_name(column)
        for concept in match_semantic_role(norm):
            mapping.setdefault(concept, []).append(column)
    return mapping


def coerce_frame(df: pl.DataFrame) -> pl.DataFrame:
    """Light normalization pass that never mutates source semantics silently.

    - Trims string whitespace.
    - Leaves everything else untouched; transformations are reported via
      profiling rather than applied destructively.
    """
    expressions: list[Any] = []
    for column, dtype in df.schema.items():
        if dtype == pl.String:
            expressions.append(pl.col(column).str.strip_chars().alias(column))
        else:
            expressions.append(pl.col(column))
    return df.with_columns(expressions)


def deduplicate_column_names(columns: list[str]) -> list[str]:
    seen: dict[str, int] = {}
    result: list[str] = []
    for col in columns:
        norm = normalize_column_name(col)
        count = seen.get(norm, 0)
        seen[norm] = count + 1
        result.append(norm if count == 0 else f"{norm}_{count + 1}")
    return result
