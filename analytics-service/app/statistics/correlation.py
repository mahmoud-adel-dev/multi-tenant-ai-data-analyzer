"""Correlation analysis (Pearson + Spearman) with strength classification."""
from __future__ import annotations

import polars as pl
import polars.selectors as cs
from scipy import stats as sps

from app.schemas.contract import CorrelationPair


def compute_correlations(
    df: pl.DataFrame,
    max_pairs: int = 60,
    min_samples: int = 10,
) -> list[CorrelationPair]:
    """Pairwise correlations over numeric columns; skips constant columns."""
    numeric_cols = df.select(cs.numeric()).columns

    usable: list[tuple[str, pl.Series]] = []
    for col in numeric_cols:
        s = df[col].cast(pl.Float64, strict=False).drop_nulls()
        if s.len() >= min_samples and s.std() and float(s.std()) > 0:
            usable.append((col, s))

    results: list[CorrelationPair] = []
    for i in range(len(usable)):
        for j in range(i + 1, len(usable)):
            if len(results) >= max_pairs:
                return sorted(results, key=lambda r: -abs(r.coefficient))

            name_a, series_a = usable[i]
            name_b, series_b = usable[j]

            # Align on non-null pairs.
            pair_df = pl.DataFrame({"a": df[name_a], "b": df[name_b]}).drop_nulls()
            if pair_df.height < min_samples:
                continue

            a = pair_df["a"].cast(pl.Float64).to_numpy()
            b = pair_df["b"].cast(pl.Float64).to_numpy()

            std_a = a.std()
            std_b = b.std()
            if std_a == 0 or std_b == 0:
                continue

            pearson_r, _pearson_p = sps.pearsonr(a, b)
            method = "pearson"
            coeff = float(pearson_r)

            # Spearman for clearly non-linear/ordinal relationships.
            pearson_abs = abs(coeff)
            spearman_r, _spearman_p = sps.spearmanr(a, b)
            if abs(float(spearman_r)) > pearson_abs + 0.15:
                method = "spearman"
                coeff = float(spearman_r)

            if any(map(lambda v: v != v, [coeff])):  # NaN guard
                continue

            magnitude = abs(coeff)
            strength = "strong" if magnitude >= 0.7 else ("moderate" if magnitude >= 0.4 else "weak")
            if strength == "weak":
                continue  # Only report relationships worth attention.

            results.append(
                CorrelationPair(
                    columnA=name_a,
                    columnB=name_b,
                    coefficient=round(coeff, 4),
                    method=method,
                    sampleSize=pair_df.height,
                    strength=strength,
                )
            )

    return sorted(results, key=lambda r: -abs(r.coefficient))
