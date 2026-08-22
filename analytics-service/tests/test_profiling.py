"""Profiling, normalization and type-inference tests."""
from __future__ import annotations

import io

import polars as pl

from app.core.loader import load_table
from app.profiling.normalize import normalize_column_name
from app.profiling.profiler import infer_domain, profile_dataset


class TestNormalization:
    def test_slugifies_names(self) -> None:
        assert normalize_column_name("Total Revenue (USD)") == "total_revenue_usd"
        assert normalize_column_name("  Order Date ") == "order_date"
        assert normalize_column_name("") == "column"

    def test_dedupes_columns(self) -> None:
        from app.profiling.normalize import deduplicate_column_names

        assert deduplicate_column_names(["A", "a", "A"]) == ["a", "a_2", "a_3"]


class TestLoader:
    def test_loads_csv(self, sales_csv_bytes: bytes) -> None:
        loaded = load_table(sales_csv_bytes, "csv")
        assert loaded.frame.height == 120
        assert set(["revenue", "quantity"]).issubset(loaded.frame.columns)

    def test_loads_tsv(self) -> None:
        data = b"a\tb\n1\tx\n2\ty\n"
        loaded = load_table(data, "tsv")
        assert loaded.frame.height == 2
        assert loaded.detected_delimiter == "\t"

    def test_rejects_invalid_json(self) -> None:
        from app.core.exceptions import MalformedFileError

        try:
            load_table(b"{not json", "json")
            raise AssertionError("should have raised")
        except MalformedFileError:
            pass

    def test_enforces_row_cap(self, sales_csv_bytes: bytes, monkeypatch: object) -> None:
        from app.core import config

        monkeypatch.setattr(config.settings, "max_rows", 10, raising=False)
        loaded = load_table(sales_csv_bytes, "csv")
        assert loaded.frame.height <= 11


class TestProfiler:
    def test_profiles_sales_dataset(self, sales_df: pl.DataFrame) -> None:
        profile, domain, findings, _df = profile_dataset(sales_df)
        assert profile.rowCount == 120
        assert profile.columnCount == sales_df.width
        revenue = next(c for c in profile.columns if c.name == "revenue")
        assert revenue.inferredType in ("numeric", "integer")
        assert revenue.mean is not None and revenue.median is not None
        order_date = next(c for c in profile.columns if c.name == "order_date")
        assert order_date.role == "date"
        assert 0 <= profile.qualityScore <= 100

    def test_detects_duplicates_and_missing(self, messy_csv_bytes: bytes) -> None:
        loaded = load_table(messy_csv_bytes, "csv")
        profile, _domain, findings, _df = profile_dataset(loaded.frame)
        issue_types = {f.issueType for f in findings}
        assert "missing_values" in issue_types or "duplicate_rows" in issue_types

    def test_domain_inference_sales(self, sales_df: pl.DataFrame) -> None:
        profile, domain, _f, _df = profile_dataset(sales_df)
        assert domain.domain in ("sales", "ecommerce")
        assert "revenue" in domain.semanticColumns or "order_date" in domain.semanticColumns
        assert 0.0 <= domain.confidence <= 1.0

    def test_constant_column_flagged(self) -> None:
        df = pl.DataFrame({"const": ["x"] * 50, "vary": list(range(50))})
        _profile, _domain, findings, _df = profile_dataset(df)
        assert any(f.issueType == "constant_column" for f in findings)
