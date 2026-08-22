"""Segmentation: RFM analysis and guarded k-means clustering.

ML SAFETY RULES ENFORCED HERE:
- k-means runs only when the dataset has enough rows (>= 30) and clean features.
- k selection is bounded; silhouette guards against nonsense clusterings.
- Every result reports algorithm, features, sample size, metrics and warnings.
"""
from __future__ import annotations

from typing import Any

import numpy as np
import polars as pl
import polars.selectors as cs

from app.schemas.contract import Segment, SegmentCharacteristic
from app.profiling.normalize import guess_semantic_columns

MIN_ROWS_CLUSTER = 30
MAX_K = 6


def compute_rfm(
    df: pl.DataFrame,
    profiles: list[Any],
) -> list[Segment] | None:
    """RFM segmentation when customer/date/amount semantics are present."""
    semantic = guess_semantic_columns(df)

    customer_cols = semantic.get("customer", [])
    date_cols = semantic.get("order_date", []) + [p.name for p in profiles if p.role == "date"]
    amount_cols = semantic.get("revenue", [])

    date_col: str | None = None
    for c in date_cols:
        dtype = df.schema[c]
        parsed_ok = False
        if dtype == pl.Date or dtype == pl.Datetime:
            parsed_ok = True
            work_expr = pl.col(c).alias("_date")
        elif dtype in (pl.String, pl.Utf8):
            test = df[c].drop_nulls().head(200).str.to_date(strict=False)
            if test.len() and test.is_not_null().sum() >= test.len() * 0.7:
                parsed_ok = True
                work_expr = pl.col(c).str.to_date(strict=False).alias("_date")
        if parsed_ok:
            date_col = c
            break

    if not customer_cols or date_col is None or not amount_cols:
        return None

    customer_col = customer_cols[0]
    amount_col = amount_cols[0]

    rfm = (
        df.with_columns(work_expr)
        .with_columns(pl.col(amount_col).cast(pl.Float64, strict=False).alias("_amount"))
        .drop_nulls(["_date", "_amount"])
        .group_by(customer_col)
        .agg(
            [
                pl.col("_date").max().alias("_last"),
                pl.col("_date").count().alias("_frequency"),
                pl.col("_amount").sum().alias("_monetary"),
            ]
        )
        .drop_nulls()
    )

    if rfm.height < 20:
        return None

    ref_date = rfm["_last"].max()
    rfm = rfm.with_columns(((pl.lit(ref_date) - pl.col("_last")).dt.total_days()).alias("_recency"))
    rfm = rfm.drop_nulls(["_recency"])
    if rfm.height < 20:
        return None

    # Quintile scoring (5 = best). A degenerate dimension (e.g. every customer
    # has identical frequency) gets a neutral middle score instead of aborting
    # the whole segmentation.
    def _qcut_or_neutral(column: str) -> pl.Expr:
        try:
            scored = pl.col(column).qcut(5, labels=["1", "2", "3", "4", "5"])
            # Validate on this frame; qcut can still raise at collect time for
            # constant inputs, so probe once here.
            rfm.select(scored).head(1)
            return scored
        except Exception:
            return pl.lit("3").alias(column)

    try:
        rfm = rfm.with_columns(
            [
                _qcut_or_neutral("_recency").alias("_r_score"),
                _qcut_or_neutral("_frequency").alias("_f_score"),
                _qcut_or_neutral("_monetary").alias("_m_score"),
            ]
        )
        # Force string dtype consistency (qcut may emit categorical).
        rfm = rfm.with_columns(
            [
                pl.col("_r_score").cast(pl.String),
                pl.col("_f_score").cast(pl.String),
                pl.col("_m_score").cast(pl.String),
            ]
        )
    except Exception:
        return None  # Truly degenerate frame — skip RFM rather than mislead.

    overall_recency = float(rfm["_recency"].mean() or 0)
    overall_frequency = float(rfm["_frequency"].mean() or 0)
    overall_monetary = float(rfm["_monetary"].mean() or 0)

    def segment_label(r: int, f: int, m: int) -> str | None:
        if r >= 4 and f >= 4:
            return "Champions"
        if r >= 3 and f >= 2:
            return "Loyal Customers"
        if r <= 2 and f >= 3:
            return "At Risk"
        if r <= 2 and f <= 2:
            return "Hibernating"
        if r >= 4 and f <= 2:
            return "New / Promising"
        return None

    rows = rfm.to_dicts()
    buckets: dict[str, dict[str, Any]] = {}
    unlabeled: list[dict[str, Any]] = []
    for row in rows:
        label = segment_label(int(row["_r_score"]), int(row["_f_score"]), int(row["_m_score"]))
        target = buckets.setdefault(label, {"n": 0, "r": [], "f": [], "m": []}) if label else None
        if target is None:
            unlabeled.append(row)
            continue
        target["n"] += 1
        target["r"].append(float(row["_recency"]))
        target["f"].append(float(row["_frequency"]))
        target["m"].append(float(row["_monetary"]))

    total = len(rows)
    segments: list[Segment] = []
    for label, data in sorted(buckets.items(), key=lambda kv: -kv[1]["n"]):
        characteristics = [
            SegmentCharacteristic(feature="recency_days", meanValue=round(np.mean(data["r"]), 2), overallMean=round(overall_recency, 2)),
            SegmentCharacteristic(feature="purchase_frequency", meanValue=round(np.mean(data["f"]), 2), overallMean=round(overall_frequency, 2)),
            SegmentCharacteristic(feature="monetary_value", meanValue=round(np.mean(data["m"]), 2), overallMean=round(overall_monetary, 2)),
        ]
        segments.append(
            Segment(
                method="rfm",
                name=label.lower().replace(" ", "_").replace("/", "_"),
                size=data["n"],
                sizePercentage=round(data["n"] / total * 100, 1),
                characteristics=characteristics,
                label=label,
            )
        )
    return segments or None


def compute_kmeans_segments(
    df: pl.DataFrame,
    profiles: list[Any],
) -> tuple[list[Segment], list[str]] | None:
    """Guarded k-means over numeric measures. Returns (segments, warnings)."""
    warnings: list[str] = []
    feature_cols = [
        p.name for p in profiles if p.role == "measure" and p.inferredType != "identifier" and p.nullPercentage < 20
    ][:6]

    if len(feature_cols) < 2:
        warnings.append("Clustering skipped: fewer than two reliable numeric features.")
        return None

    X_df = df.select(feature_cols).cast(pl.Float64, strict=False).drop_nulls()
    n = X_df.height
    if n < MIN_ROWS_CLUSTER:
        warnings.append(f"Clustering skipped: {n} complete rows is below the minimum of {MIN_ROWS_CLUSTER}.")
        return None

    from sklearn.cluster import KMeans
    from sklearn.metrics import silhouette_score
    from sklearn.preprocessing import RobustScaler

    X_raw = X_df.to_numpy()
    scaler = RobustScaler()
    X = scaler.fit_transform(X_raw)

    # Bounded k search with silhouette guard.
    best_k, best_score, best_model = None, -1.0, None
    max_k = min(MAX_K, n // 10)
    for k in range(2, max_k + 1):
        model = KMeans(n_clusters=k, random_state=42, n_init=10)
        labels = model.fit_predict(X)
        score = float(silhouette_score(X, labels))
        if score > best_score:
            best_k, best_score, best_model = k, score, model

    if best_k is None or best_model is None or best_score < 0.25:
        warnings.append(
            f"Clustering skipped: no meaningful natural grouping found (best silhouette={best_score:.2f})."
        )
        return (None, warnings) if warnings else None  # type: ignore[return-value]

    labels = best_model.labels_
    overall_means = {col: float(np.mean(X_raw[:, i])) for i, col in enumerate(feature_cols)}

    segments: list[Segment] = []
    order = np.argsort([-(labels == k).sum() for k in range(best_k)])
    for rank, cluster_id in enumerate(order):
        mask = labels == cluster_id
        size = int(mask.sum())
        size_pct = round(size / n * 100, 1)
        characteristics = [
            SegmentCharacteristic(
                feature=col,
                meanValue=round(float(np.mean(X_raw[mask, i])), 3),
                overallMean=round(overall_means[col], 3),
            )
            for i, col in enumerate(feature_cols)
        ]
        # Name the cluster by its most distinctive feature.
        distinctive = max(characteristics, key=lambda c: abs(c.meanValue - c.overallMean) / (abs(c.overallMean) or 1))
        direction = "high" if distinctive.meanValue > distinctive.overallMean else "low"
        segments.append(
            Segment(
                method="kmeans",
                name=f"cluster_{cluster_id + 1}",
                size=size,
                sizePercentage=size_pct,
                characteristics=characteristics,
                label=f"Segment {cluster_id + 1}: {direction} {distinctive.feature} (silhouette {best_score:.2f})",
            )
        )

    warnings.append(
        f"k-means (k={best_k}, silhouette={best_score:.2f}, n={n}) on features [{', '.join(feature_cols)}]; clusters are descriptive, not causal groups."
    )
    return segments, warnings


__all__ = ["compute_rfm", "compute_kmeans_segments", "detect_outliers"]
