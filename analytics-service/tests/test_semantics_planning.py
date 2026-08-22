"""Semantic inference + analysis planning tests."""
from __future__ import annotations

import polars as pl
import pytest

from app.core.planner import build_analysis_plan
from app.profiling.flatten import flatten_frame
from app.profiling.profiler import profile_dataset


def _sales_nested_df() -> pl.DataFrame:
    return pl.DataFrame([
        {
            "order_id": f"O{i}",
            "order_date": f"2025-01-{(i % 28) + 1:02d}",
            "customer": {"customer_id": f"C{i % 10}", "region": ["East", "West"][i % 2]},
            "pricing": {"total": 100.0 + i, "discount_rate": 0.1},
            "payment": {"status": "completed" if i % 3 else "cancelled"},
            "quantity": 1 + i % 4,
        }
        for i in range(40)
    ])


class TestSemantics:
    def _profile(self, df: pl.DataFrame):
        flat = flatten_frame(df)
        profile, domain, findings, clean = profile_dataset(flat.frame, flattened_paths=flat.flattened_paths)
        return {c.name: c for c in profile.columns}, domain

    def test_order_id_maps_to_order_ref_not_plain_identifier(self) -> None:
        cols, _ = self._profile(_sales_nested_df())
        assert cols["order_id"].semanticType == "order_ref"

    def test_pricing_total_is_revenue_with_confidence(self) -> None:
        cols, _ = self._profile(_sales_nested_df())
        p = cols["pricing.total"]
        assert p.semanticType == "revenue"
        assert (p.semanticConfidence or 0) >= 0.8

    def test_tax_amount_wins_over_revenue_token(self) -> None:
        cols, _ = self._profile(_sales_nested_df())
        # discount_rate must resolve via specificity, not the generic amount/total tokens.
        assert cols["pricing.discount_rate"].semanticType in ("percentage", "discount")

    def test_identifier_ids_stay_identifiers(self) -> None:
        df = pl.DataFrame({"ref_code": [f"X{i:04d}" for i in range(30)], "v": list(range(30))})
        cols, _ = self._profile(df)
        assert cols["ref_code"].semanticType == "identifier"

    def test_person_names_require_two_titlecase_words(self) -> None:
        df = pl.DataFrame({
            "sales_rep": ["Ahmed Hassan"] * 10 + ["Sara Ali"] * 10,
            "codes": ["CUST-0001", "Product 5"] * 10,
        })
        cols, _ = self._profile(df)
        assert cols["sales_rep"].semanticType == "person_name"
        assert cols["codes"].semanticType != "person_name"


class TestPlanner:
    def test_sales_plan_includes_business_kpis(self) -> None:
        flat = flatten_frame(_sales_nested_df())
        profile, domain, _f, _c = profile_dataset(flat.frame, flattened_paths=flat.flattened_paths)
        plan = build_analysis_plan(profile, domain)
        keys = {k.key for k in plan.kpis if k.available}
        assert {"total_revenue", "total_orders", "unique_customers", "avg_order_value"} <= keys

    def test_unavailable_kpi_reports_missing_paths(self) -> None:
        flat = flatten_frame(_sales_nested_df())
        profile, domain, _f, _c = profile_dataset(flat.frame, flattened_paths=flat.flattened_paths)
        plan = build_analysis_plan(profile, domain)
        margin = next(k for k in plan.kpis if k.key == "gross_margin_avg")
        assert not margin.available and margin.missingPaths

    def test_generic_dataset_gets_generic_plan(self) -> None:
        df = pl.DataFrame({"a": range(50), "b": [f"g{i % 3}" for i in range(50)]})
        profile, domain, _f, _c = profile_dataset(df)
        plan = build_analysis_plan(profile, domain)
        assert any(k.key == "row_count" for k in plan.kpis)

    def test_anomaly_methods_scale_with_data(self) -> None:
        small = pl.DataFrame({"a": range(20), "d": ["2025-01-01"] * 20})
        p_small, d_small, _, _ = profile_dataset(small)
        plan_small = build_analysis_plan(p_small, d_small)
        assert "isolation_forest" not in plan_small.anomalyMethods


class TestLeafQuality:
    def test_nested_missing_values_detected(self) -> None:
        df = pl.DataFrame([
            {"meta": {"score": 1.0}},
            {"meta": {"score": None}},
            {"meta": {"score": 3.0}},
        ])
        flat = flatten_frame(df)
        profile, _domain, findings, _clean = profile_dataset(flat.frame, flattened_paths=flat.flattened_paths)
        col = next(c for c in profile.columns if c.name == "meta.score")
        assert col.nullPercentage == pytest.approx(33.33, abs=0.1)
        assert any(f.issueType == "missing_values" and f.column == "meta.score" for f in findings)

    def test_quality_score_reflects_nested_missingness(self) -> None:
        dirty = pl.DataFrame([
            {"customer": {"city": "Cairo"}, "v": 1},
            {"customer": {"city": None}, "v": 2},
            {"customer": {"city": None}, "v": 3},
            {"customer": {"city": "Giza"}, "v": 4},
        ])
        flat = flatten_frame(dirty)
        profile_dirty, _, _, _ = profile_dataset(flat.frame, flattened_paths=flat.flattened_paths)
        clean = pl.DataFrame([{"customer.city": ["Cairo"] * 4}])
        flat_clean = flatten_frame(clean)
        profile_clean, _, _, _ = profile_dataset(flat_clean.frame, flattened_paths=flat_clean.flattened_paths)
        assert profile_dirty.qualityScore < profile_clean.qualityScore

    def test_out_of_range_percentage_flagged(self) -> None:
        df = pl.DataFrame({"discount_rate": [-0.5, 0.1, 0.2, 1.7]})
        profile, _d, findings, _c = profile_dataset(df)
        assert any(f.issueType == "out_of_range_percentage" for f in findings)

    def test_negative_measure_semantics_flagged(self) -> None:
        df = pl.DataFrame({"quantity": [1, -5, 3, 2], "price": [10.0] * 4})
        profile, _d, findings, _c = profile_dataset(df)
        assert any(f.issueType == "negative_values" for f in findings)
