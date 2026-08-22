"""Outlier detection with method selection and business-context labeling.

Two distinct concepts, explicitly separated:
  * statistical_outlier — unusual under a distributional rule (IQR / robust
    z-score / Isolation Forest). NOT necessarily an error or a problem.
  * business_notable — statistically unusual but plausibly legitimate given
    the field's semantics (e.g. a large positive quantity = bulk order).

Method selection follows the analysis plan: univariate rules for small
samples, Isolation Forest only when the dataset is large enough and has a
handful of clean numeric features.
"""
from __future__ import annotations

import uuid

import numpy as np
import polars as pl
import polars.selectors as cs

from app.schemas.contract import Anomaly


def _business_plausible(column_profile_semantic: str | None, value: float) -> tuple[bool, str]:
    """Decides whether an outlier may be operationally meaningful."""
    if column_profile_semantic == "quantity" and value > 0:
        return True, "a positive extreme quantity can be a legitimate bulk order"
    if column_profile_semantic == "revenue" and value > 0:
        return True, "large positive transactions may be genuine high-value orders"
    if column_profile_semantic in ("discount", "tax", "price", "cost") and value < 0:
        return False, "negative monetary values usually indicate refunds or entry errors"
    return False, ""


def detect_outliers(
    df: pl.DataFrame,
    profiles: list[Any],
    allowed_methods: list[str] | None = None,
    max_anomalies_per_column: int = 50,
) -> list[Anomaly]:
    methods = set(allowed_methods) if allowed_methods else {"iqr", "robust_zscore", "isolation_forest"}
    semantic_of = {p.name: p.semanticType for p in profiles}
    anomalies: list[Anomaly] = []

    measure_cols = [
        p.name
        for p in profiles
        if p.role == "measure" and p.inferredType != "identifier" and not (methods.isdisjoint({"iqr", "robust_zscore"}))
    ][:6]

    for col in measure_cols:
        series = df[col].cast(pl.Float64, strict=False).drop_nulls()
        n = series.len()
        if n < 12:
            continue

        arr = series.to_numpy()

        # ── IQR ────────────────────────────────────────────────────────
        if "iqr" in methods:
            q1, q3 = np.percentile(arr, [25, 75])
            iqr = q3 - q1
            if iqr > 0:
                lo, hi = q1 - 1.5 * iqr, q3 + 1.5 * iqr
            else:
                # Degenerate spread (constant column + extremes): any
                # departure from the repeated value is anomalous by definition.
                lo, hi = float(q1), float(q3)
            mask = (arr < lo) | (arr > hi)
            count = int(mask.sum())
            if count:
                pct = count / n * 100
                idxs = np.where(mask)[0][:max_anomalies_per_column]
                for idx in idxs:
                    plausible, why = _business_plausible(semantic_of.get(col), float(arr[idx]))
                    anomalies.append(
                        Anomaly(
                            id=str(uuid.uuid4()),
                            method="iqr",
                            column=col,
                            rowIndex=int(idx),
                            groupLabel=None,
                            value=round(float(arr[idx]), 4),
                            expectedRange=(round(float(lo), 4), round(float(hi), 4)),
                            severity="high" if pct < 1 else ("medium" if pct < 5 else "low"),
                            classification="business_notable" if plausible else "statistical_outlier",
                            explanation=(
                                f"Statistical outlier: {arr[idx]:,.2f} lies outside the typical range "
                                f"[{lo:,.2f}, {hi:,.2f}] for {col}. This does not by itself indicate a data error."
                                + (f" Contextually, {why}." if why else "")
                            ),
                        )
                    )

        # ── Robust z-score (median/MAD) ────────────────────────────────
        if "robust_zscore" in methods:
            median = float(np.median(arr))
            mad = float(np.median(np.abs(arr - median)))
            if mad > 0:
                robust_z = np.abs(0.6745 * (arr - median) / mad)
                extreme_mask = robust_z > 5
                if extreme_mask.any():
                    idxs = np.where(extreme_mask)[0][:10]
                    already = {a.rowIndex for a in anomalies if a.column == col}
                    for idx in idxs:
                        if int(idx) in already:
                            continue
                        plausible, why = _business_plausible(semantic_of.get(col), float(arr[idx]))
                        anomalies.append(
                            Anomaly(
                                id=str(uuid.uuid4()),
                                method="robust_zscore",
                                column=col,
                                rowIndex=int(idx),
                                groupLabel=None,
                                value=round(float(arr[idx]), 4),
                                expectedRange=None,
                                severity="high",
                                classification="business_notable" if plausible else "statistical_outlier",
                                explanation=(
                                    f"Extreme deviation from the median of {col} (robust z={float(robust_z[idx]):.1f}). "
                                    f"This is a statistical flag, not proof of an error."
                                    + (f" Contextually, {why}." if why else "")
                                ),
                            )
                        )

    # ── Isolation Forest — only when the plan allows it and data justifies it ──
    if "isolation_forest" in methods:
        numeric_df = df.select(cs.numeric()).drop_nulls()
        if numeric_df.height >= 200 and 3 <= numeric_df.width <= 20:
            try:
                from sklearn.ensemble import IsolationForest

                X = numeric_df.cast(pl.Float64).to_numpy()
                iso = IsolationForest(contamination=0.02, random_state=42, n_estimators=100)
                labels = iso.fit_predict(X)
                flagged = np.where(labels == -1)[0]
                for row_idx in flagged[:30]:
                    anomalies.append(
                        Anomaly(
                            id=str(uuid.uuid4()),
                            method="isolation_forest",
                            column=", ".join(numeric_df.columns[:4]) + ("…" if len(numeric_df.columns) > 4 else ""),
                            rowIndex=int(row_idx),
                            groupLabel=None,
                            value=round(float(X[row_idx].mean()), 4),
                            expectedRange=None,
                            severity="medium",
                            classification="statistical_outlier",
                            explanation=(
                                f"Row {int(row_idx)} is unusual across multiple numeric dimensions simultaneously "
                                f"(Isolation Forest, 2% contamination budget). Multivariate flag for review — "
                                f"not evidence of an error."
                            ),
                        )
                    )
            except Exception:
                pass  # best-effort escalation; deterministic methods already ran

    return anomalies[:300]


__all__ = ["detect_outliers"]
