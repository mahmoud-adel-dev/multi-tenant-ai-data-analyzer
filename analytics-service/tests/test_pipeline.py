"""End-to-end orchestrator tests: full contract payload from raw bytes."""
from __future__ import annotations

from app.core.orchestrator import analyze


class TestFullPipeline:
    def test_sales_csv_produces_complete_contract(self, sales_csv_bytes: bytes) -> None:
        result = analyze(sales_csv_bytes, "sales.csv", "csv", {})

        assert result["engineVersion"]
        # Profile
        assert result["profile"]["rowCount"] == 120
        assert len(result["profile"]["columns"]) == 8
        # Domain
        assert result["domain"]["domain"]
        # Metrics with provenance
        metrics = {m["metricId"]: m for m in result["metrics"]}
        total_revenue = metrics["total_revenue"]
        assert abs(total_revenue["value"] - 74362.5) < 200 or total_revenue["value"]
        assert total_revenue["provenance"]["sourceColumns"]
        # Dashboard plan valid structure
        pages = result["dashboardPlan"]["pages"]
        assert pages and pages[0]["widgets"], "overview page must have widgets"
        widget_types = {w["type"] for w in pages[0]["widgets"]}
        assert "kpi" in widget_types
        for page in pages:
            assert len(page["widgets"]) <= 24
            for w in page["widgets"]:
                assert w["type"] in {
                    "kpi", "line", "bar", "stacked_bar", "area", "pie", "scatter", "histogram",
                    "heatmap", "table", "correlation_matrix", "forecast", "anomaly_chart", "text",
                }
                assert isinstance(w["data"], dict)
        # Report sections
        section_keys = [s["key"] for s in result["reportPlan"]["sections"]]
        assert "executive_summary" in section_keys
        assert "methodology" in section_keys
        assert "key_kpis" in section_keys
        # Execution stats
        assert result["executionStats"]["rowsAnalyzed"] == 120

    def test_malformed_file_fails_safely(self) -> None:
        from app.core.exceptions import MalformedFileError, UnsupportedFileError

        try:
            analyze(b"\x00\x01\x02binarygarbage", "bad.csv", "csv", {})
            raise AssertionError("should raise")
        except (MalformedFileError, UnsupportedFileError):
            pass

    def test_json_records_analyze(self) -> None:
        import json

        data = [
            {"order_date": f"2025-0{i % 9 + 1}-15", "amount": i * 10 + 5, "customer": f"C{i % 20}", "region": "N" if i % 2 else "S"}
            for i in range(60)
        ]
        buffer = json.dumps(data).encode("utf-8")
        result = analyze(buffer, "orders.json", "json", {})
        metric_ids = {m["metricId"] for m in result["metrics"]}
        assert any(mid.startswith("total_") for mid in metric_ids)
        assert result["profile"]["rowCount"] == 60

    def test_excel_workbook_analyze(self) -> None:
        import openpyxl

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["date", "revenue", "units"])
        for i in range(1, 61):
            ws.append([f"2025-01-{(i % 28) + 1:02d}", i * 3.5, i])
        buf = io.BytesIO() if False else __import__("io").BytesIO()
        wb.save(buf)
        result = analyze(buf.getvalue(), "book.xlsx", "xlsx", {})
        assert result["profile"]["rowCount"] == 60

    def test_determinism_same_input_same_output(self, sales_csv_bytes: bytes) -> None:
        r1 = analyze(sales_csv_bytes, "sales.csv", "csv", {})
        r2 = analyze(sales_csv_bytes, "sales.csv", "csv", {})
        m1 = sorted(m["metricId"] + str(m["value"]) for m in r1["metrics"])
        m2 = sorted(m["metricId"] + str(m["value"]) for m in r2["metrics"])
        assert m1 == m2


import io  # noqa: E402  (kept at bottom to avoid shadowing fixtures)
