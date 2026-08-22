"""API routes with bearer-token authentication and strict limits."""
from __future__ import annotations

import hmac

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile

from app.core.config import ENGINE_VERSION, settings
from app.core.exceptions import FileTooLargeError
from app.core.loader import load_table
from app.core.orchestrator import analyze
from app.profiling.profiler import profile_dataset
from app.schemas.contract import AnalyzeOptions

router = APIRouter(prefix="/v1")


def verify_token(request: Request) -> None:
    """Bearer-token gate when ANALYTICS_API_TOKEN is configured."""
    if not settings.api_token:
        return  # No token configured — service is network-isolated by deployment.
    header = request.headers.get("Authorization", "")
    provided = header.removeprefix("Bearer ").strip()
    if not provided or not hmac.compare_digest(provided, settings.api_token):
        raise HTTPException(status_code=401, detail="Invalid or missing service token.")


async def _read_upload(file: UploadFile) -> bytes:
    """Read an upload while enforcing the service-wide byte ceiling."""
    if file.size is not None and file.size > settings.max_upload_bytes:
        raise FileTooLargeError("File exceeds maximum allowed size.")

    buffer = await file.read()
    if len(buffer) > settings.max_upload_bytes:
        raise FileTooLargeError("File exceeds maximum allowed size.")
    return buffer


@router.post("/validate")
async def validate_endpoint(
    file: UploadFile = File(...),
    file_type: str = Form(""),
    _token: None = Depends(verify_token),
) -> dict:
    """Parse an upload and report its shape without running analytics."""
    buffer = await _read_upload(file)
    loaded = load_table(buffer, file_type.strip().lower() or None)
    return {
        "valid": True,
        "rowCount": loaded.frame.height,
        "columnCount": loaded.frame.width,
        "columns": loaded.frame.columns,
        "warnings": loaded.warnings,
    }


@router.post("/analyze")
async def analyze_endpoint(
    file: UploadFile = File(...),
    options: str = Form("{}"),
    _token: None = Depends(verify_token),
) -> dict:
    try:
        opts = AnalyzeOptions.model_validate_json(options or "{}")
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid options JSON.") from exc

    buffer = await _read_upload(file)

    max_rows = min(opts.max_rows or settings.max_rows, settings.max_rows)
    effective_options = {"max_rows": max_rows}

    result = analyze(
        buffer,
        filename=file.filename or "dataset.csv",
        file_type=(opts.file_type or "").lower() or None,
        options=effective_options,
    )
    return result


@router.post("/profile")
async def profile_endpoint(
    file: UploadFile = File(...),
    options: str = Form("{}"),
    _token: None = Depends(verify_token),
) -> dict:
    buffer = await _read_upload(file)
    loaded = load_table(buffer, (options or "").lower() or None)
    profile, domain, findings, _df = profile_dataset(loaded.frame)
    return {
        "profile": profile.model_dump(mode="json"),
        "domain": domain.model_dump(mode="json"),
        "findings": [f.model_dump(mode="json") for f in findings],
    }


@router.get("/healthz")
async def healthz() -> dict:
    return {"status": "ok", "engineVersion": ENGINE_VERSION}
