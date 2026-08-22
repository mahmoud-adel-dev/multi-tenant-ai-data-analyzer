"""API contract tests (FastAPI TestClient)."""
from __future__ import annotations

import pytest

fastapi = pytest.importorskip("fastapi")
httpx = pytest.importorskip("httpx")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import create_app  # noqa: E402


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app())


class TestHealth:
    def test_healthz(self, client: TestClient) -> None:
        res = client.get("/healthz")
        assert res.status_code == 200
        assert res.json()["status"] == "ok"

    def test_readyz(self, client: TestClient) -> None:
        res = client.get("/readyz")
        assert res.status_code == 200
        assert res.json()["status"] == "ready"

    def test_versioned_healthz(self, client: TestClient) -> None:
        res = client.get("/v1/healthz")
        assert res.status_code == 200
        assert res.json()["engineVersion"]


class TestAnalyzeEndpoint:
    def test_analyze_csv(self, client: TestClient, sales_csv_bytes: bytes) -> None:
        res = client.post(
            "/v1/analyze",
            files={"file": ("sales.csv", sales_csv_bytes, "text/csv")},
            data={"options": '{"file_type": "csv"}'},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["profile"]["rowCount"] == 120

    def test_rejects_bad_options(self, client: TestClient, sales_csv_bytes: bytes) -> None:
        res = client.post(
            "/v1/analyze",
            files={"file": ("sales.csv", sales_csv_bytes, "text/csv")},
            data={"options": "not-json"},
        )
        assert res.status_code == 400


class TestValidateEndpoint:
    def test_validates_csv_without_running_analysis(
        self, client: TestClient, sales_csv_bytes: bytes
    ) -> None:
        res = client.post(
            "/v1/validate",
            files={"file": ("sales.csv", sales_csv_bytes, "text/csv")},
            data={"file_type": "csv"},
        )

        assert res.status_code == 200
        assert res.json() == {
            "valid": True,
            "rowCount": 120,
            "columnCount": 8,
            "columns": [
                "order_id",
                "order_date",
                "customer",
                "product",
                "category",
                "region",
                "quantity",
                "revenue",
            ],
            "warnings": [],
        }

    def test_rejects_invalid_json_with_typed_error(self, client: TestClient) -> None:
        res = client.post(
            "/v1/validate",
            files={"file": ("broken.json", b'{"records": [', "application/json")},
            data={"file_type": "json"},
        )

        assert res.status_code == 400
        assert res.json() == {
            "success": False,
            "error": {"code": "MALFORMED_FILE", "message": "Invalid JSON."},
        }

    def test_accepts_json_with_utf8_bom(self, client: TestClient) -> None:
        res = client.post(
            "/v1/validate",
            files={
                "file": (
                    "bom.json",
                    b'\xef\xbb\xbf[{"name":"Ada"}]',
                    "application/json",
                )
            },
            data={"file_type": "json"},
        )

        assert res.status_code == 200
        assert res.json()["rowCount"] == 1


class TestTokenAuth:
    def test_token_enforced_when_configured(self, monkeypatch: object) -> None:
        from app.core import config

        monkeypatch.setattr(config.settings, "api_token", "secret-token", raising=False)
        c = TestClient(create_app())
        res = c.get("/healthz")
        assert res.status_code == 200  # health stays open for orchestration probes

        res = c.post("/v1/analyze", files={"file": ("a.csv", b"a,b\n1,2\n", "text/csv")})
        assert res.status_code == 401

        res = c.post(
            "/v1/analyze",
            files={"file": ("a.csv", b"a,b\n1,2\n", "text/csv")},
            headers={"Authorization": "Bearer secret-token"},
        )
        assert res.status_code == 200
