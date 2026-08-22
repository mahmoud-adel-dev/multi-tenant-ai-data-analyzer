"""Analytics service application factory."""
from __future__ import annotations

import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from app.api.routes import router
from app.core.config import ENGINE_VERSION
from app.core.exceptions import AnalyticsError

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


def create_app() -> FastAPI:
    app = FastAPI(
        title="Deterministic Analytics Engine",
        version=ENGINE_VERSION,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )

    @app.exception_handler(AnalyticsError)
    async def analytics_error_handler(_request: Request, exc: AnalyticsError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"success": False, "error": {"code": exc.code, "message": exc.message}},
        )

    @app.get("/healthz")
    async def healthz() -> dict:
        return {"status": "ok", "engineVersion": ENGINE_VERSION}

    @app.get("/readyz")
    async def readyz() -> dict:
        # Import-time validation: core scientific stack must be importable.
        import numpy  # noqa: F401
        import polars  # noqa: F401
        import scipy  # noqa: F401
        import sklearn  # noqa: F401

        return {"status": "ready", "engineVersion": ENGINE_VERSION}

    app.include_router(router)

    return app


app = create_app()
