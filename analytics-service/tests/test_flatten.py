"""Nested-JSON flattening, semantic inference, analysis planning and
leaf-level quality findings."""
from __future__ import annotations

import polars as pl
import pytest

from app.core.planner import build_analysis_plan
from app.profiling.flatten import flatten_frame
from app.profiling.profiler import build_quality_findings, profile_dataset


@pytest.fixture
def nested_df() -> pl.DataFrame:
    return pl.DataFrame([
        {
            "order_id": "O1",
            "customer": {"customer_id": "C1", "segment": "Enterprise", "region": "East", "address": {"city": "Cairo"}},
            "pricing": {"total": 100.5, "discount_rate": None, "tax_amount": 15.0},
            "tags": ["bulk"],
        },
        {
            "order_id": "O2",
            "customer": {"customer_id": None, "segment": None, "region": "West", "address": {"city": None}},
            "pricing": {"total": None, "discount_rate": 0.25, "tax_amount": -3.0},
            "tags": [],
        },
        {
            "order_id": "O1",
            "customer": {"customer_id": "C1", "segment": "Enterprise", "region": "East", "address": {"city": "Cairo"}},
            "pricing": {"total": 50.0, "discount_rate": 1.5, "tax_amount": 7.0},
            "tags": [],
        },
    ])


class TestFlatten:
    def test_nested_paths_become_leaf_columns(self, nested_df: pl.DataFrame) -> None:
        result = flatten_frame(nested_df)
        cols = set(result.frame.columns)
        assert "customer.customer_id" in cols
        assert "customer.address.city" in cols
        assert "pricing.total" in cols
        assert "customer" not in cols and "pricing" not in cols

    def test_flattened_paths_reported(self, nested_df: pl.DataFrame) -> None:
        result = flatten_frame(nested_df)
        assert "pricing.total" in result.flattened_paths
        assert "customer.address.city" in result.flattened_paths

    def test_nested_nulls_propagate(self, nested_df: pl.DataFrame) -> None:
        result = flatten_frame(nested_df)
        nc = result.frame.null_count()
        assert nc["customer.customer_id"][0] == 1
        assert nc["pricing.total"][0] == 1

    def test_lists_preserved_without_row_expansion(self, nested_df: pl.DataFrame) -> None:
        result = flatten_frame(nested_df)
        assert "tags" in result.list_columns
        assert result.frame.height == nested_df.height

    def test_empty_struct_dropped(self) -> None:
        df = pl.DataFrame([{"e": {}, "x": 1}, {"e": {}, "x": 2}])
        result = flatten_frame(df)
        assert result.dropped_empty_structs == ["e"]
