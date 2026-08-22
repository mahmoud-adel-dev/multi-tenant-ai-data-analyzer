"""Deterministic dataset profiling: type inference, semantic labeling,
structural stats for nested/list fields, and evidence-based quality findings.
"""
from __future__ import annotations

import math
import uuid
from typing import Any

import numpy as np
import polars as pl

from app.schemas.contract import (
    ColumnProfile,
    DatasetProfile,
    DomainInference,
    QualityFinding,
)
from app.profiling.normalize import coerce_frame, normalize_column_name
from app.profiling.semantics import infer_semantics

DATE_PATTERNS = [
    r"^\d{4}-\d{1,2}-\d{1,2}$",
    r"^\d{1,2}/\d{1,2}/\d{4}$",
    r"^\d{1,2}-\d{1,2}-\d{4}$",
    r"^\d{4}\.\d{1,2}\.\d{1,2}$",
]

IDENTIFIER_HINTS = {"id", "uuid", "guid", "key", "no", "number", "code", "ref"}

# Measure semantics where negative values indicate data problems rather than
# legitimate business facts (margins/profits are excluded on purpose).
NON_NEGATIVE_SEMANTICS = {"revenue", "price", "quantity", "tax", "discount_amount", "shipping_cost", "duration"}

LIST_SAMPLE_ROWS = 10_000


def _is_identifier_like(name: str, unique_ratio: float, dtype: pl.DataType) -> bool:
    norm = normalize_column_name(name)
    if any(hint in norm for hint in IDENTIFIER_HINTS):
        return True
    return unique_ratio > 0.95 and dtype in (pl.String, pl.Utf8)


def _sample_values(series: pl.Series, k: int = 5) -> list[str]:
    values = series.drop_nulls().head(k).to_list()
    return [str(v)[:80] for v in values]


def _count_blanks(series: pl.Series) -> int:
    if series.dtype not in (pl.String, pl.Utf8):
        return 0
    return int(series.str.strip_chars().eq("").fill_null(False).sum())


def _profile_list_column(df: pl.DataFrame, column: str) -> ColumnProfile:
    """Structural profile for array-typed fields without changing row grain."""
    series = df[column]
    n = df.height
    null_count = int(series.null_count())
    non_null = series.drop_nulls()
    empty_rows = 0
    avg_len: float | None = None
    top_values: list[dict[str, Any]] = []
    unique_count = 0

    if non_null.len():
        lengths = non_null.list.len()
        empty_rows = int((lengths == 0).sum())
        avg_len = round(float(lengths.mean() or 0.0), 2)
        exploded = (
            series.head(LIST_SAMPLE_ROWS).explode().drop_nulls().cast(pl.String, strict=False).drop_nulls()
        )
        if exploded.len():
            unique_count = int(exploded.n_unique())
            counts = exploded.value_counts(sort=True).head(8)
            top_values = [
                {"value": str(row[0])[:60], "count": int(row[1])}
                for row in counts.iter_rows()
            ]

    total_missing_pct = round(((null_count + empty_rows) / n * 100.0) if n else 0.0, 2)

    return ColumnProfile(
        name=column,
        normalizedName=normalize_column_name(column),
        parentPath=column.rsplit(".", 1)[0] if "." in column else None,
        inferredType="array",
        role="unknown",
        nullCount=null_count + empty_rows,
        nullPercentage=total_missing_pct,
        uniqueCount=unique_count,
        topValues=top_values,
        sampleValues=[f"[list · avg {avg_len} items]" if avg_len is not None else "[list]"],
        semanticType="array",
        semanticConfidence=0.9,
    )


def profile_column(df: pl.DataFrame, column: str) -> ColumnProfile:
    series = df[column]
    dtype = series.dtype
    if isinstance(dtype, pl.List):
        return _profile_list_column(df, column)

    n = df.height
    raw_null_count = int(series.null_count())
    blank_count = _count_blanks(series)
    # Missing-for-quality includes blanks; nullPercentage stays strictly nulls.
    effective_missing = raw_null_count + blank_count
    null_pct = (effective_missing / n * 100.0) if n else 0.0
    n_unique = int(series.n_unique())
    unique_ratio = (n_unique / n) if n else 0.0

    inferred = "unknown"
    role = "unknown"

    numeric_types = {
        pl.Int8, pl.Int16, pl.Int32, pl.Int64, pl.UInt8, pl.UInt16, pl.UInt32, pl.UInt64,
        pl.Float32, pl.Float64,
    }
    is_numeric_untyped = False

    if dtype == pl.Boolean:
        inferred = "boolean"
        role = "dimension"
    elif dtype == pl.Date or dtype == pl.Datetime:
        inferred = "date" if dtype == pl.Date else "datetime"
        role = "date"
    elif dtype in numeric_types:
        inferred = "integer" if dtype.is_integer() else "numeric"
        is_numeric_untyped = True
        role = "measure"
    elif dtype in (pl.String, pl.Utf8):
        non_null = series.drop_nulls()
        if non_null.len():
            sample = non_null.head(1000)
            str_vals = sample.cast(pl.String)
            cleaned = str_vals.str.replace_all(r"[$€£¥,\s]", "", literal=False)
            numeric_matches = cleaned.str.contains(r"^-?\d+(\.\d+)?$").sum() or 0
            pct_matches = str_vals.str.strip_chars().str.ends_with("%").sum() or 0
            date_matches = sum(
                (str_vals.str.contains(p, strict=False)).sum() or 0 for p in DATE_PATTERNS
            )
            total = sample.len()

            if date_matches >= total * 0.7:
                inferred = "date"
                role = "date"
            elif numeric_matches >= total * 0.8:
                inferred = "numeric"
                is_numeric_untyped = True
                role = "measure"
            elif pct_matches >= total * 0.8:
                inferred = "numeric"
                role = "measure"
            elif unique_ratio > 0.95 and n > 20 and _is_identifier_like(column, unique_ratio, dtype):
                inferred = "identifier"
                role = "identifier"
            elif n_unique <= max(50, n * 0.05) or n_unique < 25:
                inferred = "categorical"
                role = "dimension"
            else:
                inferred = "text"
                role = "text"

    stats: dict[str, float | None] = {}
    histogram: list[dict[str, Any]] = []
    top_values: list[dict[str, Any]] = []
    date_range: dict[str, str] | None = None

    effective_numeric = is_numeric_untyped
    working = series
    if effective_numeric and dtype not in numeric_types:
        working = (
            series.cast(pl.String)
            .str.replace_all(r"[$€£¥,\s%]", "", literal=False)
            .cast(pl.Float64, strict=False)
        )

    if working.null_count() < n and (dtype in numeric_types or effective_numeric):
        s = working.drop_nulls().cast(pl.Float64)
        if s.len():
            arr = s.to_numpy()
            finite = arr[np.isfinite(arr)]
            if finite.size:
                q = np.percentile(finite, [5, 25, 50, 75, 95]) if finite.size >= 4 else [None] * 5
                std = float(np.std(finite, ddof=1)) if finite.size > 1 else 0.0
                stats = {
                    "min": float(np.min(finite)),
                    "max": float(np.max(finite)),
                    "mean": float(np.mean(finite)),
                    "median": float(q[2]) if q[2] is not None else None,
                    "stdDev": std if not math.isnan(std) else None,
                    "p05": float(q[0]) if q[0] is not None else None,
                    "p25": float(q[1]) if q[1] is not None else None,
                    "p75": float(q[3]) if q[3] is not None else None,
                    "p95": float(q[4]) if q[4] is not None else None,
                }
                if finite.size >= 10 and inferred != "identifier":
                    counts, edges = np.histogram(finite, bins=min(20, max(5, finite.size // 20)))
                    histogram = [
                        {"bucket": f"{edges[i]:.4g}–{edges[i + 1]:.4g}", "count": int(c)}
                        for i, c in enumerate(counts)
                    ]
    elif dtype == pl.Date or dtype == pl.Datetime:
        non_null = series.drop_nulls()
        if non_null.len():
            mn, mx = non_null.min(), non_null.max()
            if mn is not None and mx is not None:
                date_range = {"min": str(mn), "max": str(mx)}
    elif inferred in ("categorical", "boolean"):
        value_counts = df.group_by(column).len().sort("len", descending=True).head(10)
        top_values = [
            {"value": str(row[0])[:60], "count": int(row[1])}
            for row in value_counts.iter_rows()
            if row[0] is not None
        ]

    sem = infer_semantics(
        series,
        inferred_type=inferred,
        role=role,
        null_percentage=null_pct,
        unique_count=n_unique,
        row_count=n,
    )

    return ColumnProfile(
        name=column,
        normalizedName=normalize_column_name(column),
        parentPath=column.rsplit(".", 1)[0] if "." in column else None,
        inferredType=inferred,
        role=role,
        nullCount=raw_null_count + blank_count,
        nullPercentage=round(null_pct, 2),
        uniqueCount=n_unique,
        min=stats.get("min"),
        max=stats.get("max"),
        mean=_round_or_none(stats.get("mean")),
        median=_round_or_none(stats.get("median")),
        stdDev=_round_or_none(stats.get("stdDev")),
        p05=_round_or_none(stats.get("p05")),
        p25=_round_or_none(stats.get("p25")),
        p75=_round_or_none(stats.get("p75")),
        p95=_round_or_none(stats.get("p95")),
        topValues=top_values,
        histogram=histogram,
        dateRange=date_range,
        sampleValues=_sample_values(series),
        semanticType=sem.semanticType,
        semanticConfidence=sem.confidence,
        **sem.flags,
    )


def _round_or_none(v: float | None) -> float | None:
    return round(v, 6) if v is not None else None


def build_quality_findings(
    df: pl.DataFrame,
    profiles: list[ColumnProfile],
    duplicate_rows: int,
) -> list[QualityFinding]:
    """Evidence-based leaf-level quality findings."""
    findings: list[QualityFinding] = []
    n = df.height

    def add(severity: str, issue_type: str, column: str | None, description: str,
           affected: int, remediation: str) -> None:
        findings.append(
            QualityFinding(
                id=str(uuid.uuid4()),
                severity=severity,  # type: ignore[arg-type]
                issueType=issue_type,
                column=column,
                description=description,
                affectedRows=int(affected),
                suggestedRemediation=remediation,
            )
        )

    for p in profiles:
        col = p.name
        series = df[col]

        if n and p.nullPercentage > 2:
            add(
                "high" if p.nullPercentage > 40 else ("medium" if p.nullPercentage > 15 else "low"),
                "missing_values",
                col,
                f"{col} has {p.nullPercentage:.1f}% missing values ({int(p.nullCount):,} rows).",
                p.nullCount,
                "Investigate collection gaps; impute or exclude this field from key metrics.",
            )

        # Invalid dates: a date-role field that fails to parse is silently
        # dropped by downstream aggregations — surface it explicitly.
        if p.role == "date" and p.inferredType == "date" and series.dtype in (pl.String, pl.Utf8) and n:
            parsed = series.str.to_date(strict=False)
            invalid = int(parsed.is_null().sum() - series.null_count())
            if invalid > 0:
                add(
                    "high" if invalid > n * 0.02 else "medium",
                    "invalid_dates",
                    col,
                    f"{col} contains {invalid:,} value(s) that are not parseable dates.",
                    invalid,
                    "Standardize the date format (e.g. YYYY-MM-DD); unparseable rows are excluded from time analysis.",
                )

        blanks = _count_blanks(series)
        if blanks > 0 and n and blanks / n > 0.02 and p.inferredType != "array":
            add(
                "medium" if blanks / n > 0.1 else "low",
                "empty_strings",
                col,
                f"{col} contains {blanks:,} blank-string values treated as missing.",
                blanks,
                "Normalize blanks to explicit nulls or fill with documented defaults.",
            )

        if n and p.uniqueCount == 1 and p.inferredType != "array":
            add(
                "low",
                "constant_column",
                col,
                f"{col} contains a single distinct value — it adds no analytical signal.",
                n,
                "Consider excluding this field from the analysis plan.",
            )

        # Out-of-range percentages (fraction-vs-percent scale inferred from mean).
        if p.isPercentage and p.min is not None and p.max is not None:
            scale_max = 1.0 if (p.mean is not None and abs(p.mean) <= 1.5) else 100.0
            violations = df.select(
                (
                    (pl.col(col).cast(pl.Float64, strict=False) < -1e-9)
                    | (pl.col(col).cast(pl.Float64, strict=False) > scale_max + 1e-9)
                )
                .fill_null(False).sum()
            ).item()
            if violations:
                add(
                    "high" if violations > n * 0.02 else "medium",
                    "out_of_range_percentage",
                    col,
                    f"{col} has {violations:,} value(s) outside the valid {scale_max:g}% range.",
                    int(violations),
                    "Verify units (fraction vs percent) and correct out-of-range entries.",
                )

        # Negative values where business semantics forbid them.
        if p.semanticType in NON_NEGATIVE_SEMANTICS and p.min is not None and p.min < 0:
            neg = df.select((pl.col(col).cast(pl.Float64, strict=False) < 0).fill_null(False).sum()).item()
            if neg:
                add(
                    "high" if neg > n * 0.01 else "medium",
                    "negative_values",
                    col,
                    f"{col} contains {neg:,} negative value(s), which is unusual for {p.semanticType} fields.",
                    int(neg),
                    "Confirm whether negatives represent refunds/corrections or data-entry errors.",
                )

        # Duplicate identifier values.
        if p.isIdentifier and n:
            expected_unique = n - int(p.nullCount)
            dup_ids = expected_unique - p.uniqueCount
            if dup_ids > 0:
                ratio = dup_ids / max(1, expected_unique)
                add(
                    "high" if ratio > 0.05 else ("medium" if ratio > 0.005 else "low"),
                    "duplicate_identifiers",
                    col,
                    f"{col} repeats {dup_ids:,} identifier value(s); uniqueness was expected.",
                    dup_ids,
                    "Deduplicate records or verify this field truly is a unique key.",
                )

        # Mixed-type text columns (numeric strings mixed with real text).
        if p.inferredType == "text" and n > 30:
            sample = series.drop_nulls().head(1000)
            if sample.len() >= 20:
                numeric_hits = sample.cast(pl.String).str.contains(r"^-?[\d,.]+$").sum() or 0
                share = numeric_hits / sample.len()
                if 0.15 <= share <= 0.85:
                    add(
                        "low",
                        "mixed_type_field",
                        col,
                        f"{col} mixes numeric-looking strings with text ({share:.0%} numeric).",
                        int(sample.len()),
                        "Split into separate typed columns or standardize the format.",
                    )

        if n > 50 and p.uniqueCount == n and p.role == "measure" and p.inferredType in ("numeric", "integer", "categorical"):
            add(
                "low",
                "high_cardinality_measure",
                col,
                f"{col} is almost certainly a row identifier rather than a measure.",
                n,
                "Verify whether this column should be treated as an ID.",
            )

    if duplicate_rows > 0:
        add(
            "medium" if duplicate_rows < n * 0.01 else "high",
            "duplicate_rows",
            None,
            f"{duplicate_rows:,} fully duplicated row(s) detected.",
            duplicate_rows,
            "De-duplicate before computing totals to avoid double counting.",
        )

    return findings[:150]


def compute_quality_score(profile_stats: dict[str, Any], findings: list[QualityFinding]) -> float:
    """0-100 score: penalize missingness, duplication and high-severity issues."""
    score = 100.0
    score -= min(45.0, profile_stats["missingCellPercentage"] * 0.7)
    if profile_stats["rowCount"]:
        dup_ratio = profile_stats["duplicateRowCount"] / profile_stats["rowCount"]
        score -= min(25.0, dup_ratio * 100)
    score -= len([f for f in findings if f.severity == "high"]) * 6
    score -= len([f for f in findings if f.severity == "medium"]) * 2
    return round(max(0.0, min(100.0, score)), 1)


# Domain scoring now runs on flattened paths + semantic flags; weak evidence
# degrades to generic_tabular instead of forcing a guess.
DOMAIN_SIGNALS: list[tuple[str, float, list[str], list[str]]] = [
    # domain, weight, required-ish semantic/path tokens (any-of boosts), strong markers (all-listed grants big boost)
    ("sales", 3.0, ["order_ref"], ["revenue"]),
    ("ecommerce", 2.5, ["customer_ref"], ["revenue", "product"]),
    ("marketing", 2.5, ["channel"], ["campaign"]),
    ("finance", 2.0, ["cost"], ["tax"]),
    ("hr", 3.0, [], ["salary"]),
    ("inventory", 3.0, [], ["stock"]),
    ("crm", 2.5, ["person_name"], ["deal", "pipeline", "lead_status"]),
]


def infer_domain(df: pl.DataFrame, profiles: list[ColumnProfile]) -> DomainInference:
    tokens = {normalize_column_name(c) for c in df.columns}
    joined = " ".join(tokens)
    semantic_of = {p.name: p.semanticType or "" for p in profiles}

    scores: dict[str, float] = {}
    evidence: list[str] = []

    def bump(domain: str, points: float, reason: str) -> None:
        scores[domain] = scores.get(domain, 0.0) + points
        evidence.append(reason)

    revenue_cols = [n for n, s in semantic_of.items() if s == "revenue"]
    order_cols = [n for n, s in semantic_of.items() if s == "order_ref"]
    customer_cols = [n for n, s in semantic_of.items() if s == "customer_ref"]
    product_cols = [n for n, s in semantic_of.items() if s == "product"]
    location_cols = [n for n, s in semantic_of.items() if s == "location"]

    if revenue_cols and order_cols:
        bump("sales", 3.0, f"Revenue fields {revenue_cols[:2]} combined with order references {order_cols[:1]}.")
    if customer_cols and (order_cols or revenue_cols):
        bump("ecommerce", 2.0, f"Customer fields {customer_cols[:2]} alongside transactional fields.")
    if product_cols and revenue_cols:
        bump("ecommerce", 1.0, f"Product fields {product_cols[:2]} paired with revenue.")
    if location_cols and revenue_cols:
        bump("sales", 1.0, "Geographic dimensions accompany monetary measures.")
    if "payment_method" in set(semantic_of.values()):
        bump("ecommerce", 1.0, "Payment-method fields detected.")
    if any(t in joined for t in ("campaign", "impressions", "clicks")):
        bump("marketing", 2.5, "Marketing campaign vocabulary detected.")
    if any(t in joined for t in ("salary", "department", "hire_date")):
        bump("hr", 3.0, "HR vocabulary (salary/department/hire date) detected.")
    if any(t in joined for t in ("stock", "warehouse", "reorder_level")):
        bump("inventory", 3.0, "Inventory management vocabulary detected.")
    if any(t in joined for t in ("invoice", "ledger", "journal")):
        bump("finance", 2.0, "Accounting vocabulary detected.")

    best = max(scores, key=lambda d: scores[d]) if scores else "generic_tabular"
    confidence = min(0.95, 0.35 + scores.get(best, 0.0) * 0.11) if scores else 0.35
    if confidence < 0.45:
        best, confidence = "generic_tabular", max(confidence, 0.35)

    semantic_columns: dict[str, list[str]] = {}
    for name, sem_type in semantic_of.items():
        if sem_type and sem_type not in ("unknown", "array"):
            semantic_columns.setdefault(sem_type, []).append(name)

    return DomainInference(
        domain=best,
        confidence=round(confidence, 2),
        evidence=evidence[:10] or ["No strong domain signals; treating as generic tabular data."],
        semanticColumns=semantic_columns,
    )


def profile_dataset(
    raw_df: pl.DataFrame,
    *,
    flattened_paths: list[str] | None = None,
) -> tuple[DatasetProfile, DomainInference, list[QualityFinding], pl.DataFrame]:
    df = coerce_frame(raw_df)
    duplicate_rows = int(df.height - df.unique().height)
    profiles = [profile_column(df, col) for col in df.columns]
    findings = build_quality_findings(df, profiles, duplicate_rows)

    total_cells = df.height * df.width
    # Missingness counts nulls AND blanks (see profile_column).
    missing_cells = int(sum(p.nullCount for p in profiles))
    missing_pct = (missing_cells / total_cells * 100.0) if total_cells else 0.0

    flat = flattened_paths or []
    stats = {
        "rowCount": df.height,
        "columnCount": df.width,
        "duplicateRowCount": duplicate_rows,
        "missingCellPercentage": round(missing_pct, 2),
    }
    quality_score = compute_quality_score(stats, findings)

    profile = DatasetProfile(
        rowCount=df.height,
        columnCount=df.width,
        leafFieldCount=df.width,
        nestedFieldCount=len({p.parentPath for p in profiles if p.parentPath}),
        duplicateRowCount=duplicate_rows,
        missingCellCount=missing_cells,
        missingCellPercentage=round(missing_pct, 2),
        qualityScore=quality_score,
        columns=profiles,
    )
    domain = infer_domain(df, profiles)
    return profile, domain, findings, df


__all__ = ["profile_dataset", "profile_column", "build_quality_findings"]
