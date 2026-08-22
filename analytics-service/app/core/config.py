"""Analytics service configuration (environment-driven, fail-fast in production)."""
from __future__ import annotations

import os
from dataclasses import dataclass


# Mutable by design: tests patch attributes on this shared instance, and all
# modules bind the same object at import time (`from app.core.config import
# settings`), so attribute-level patches propagate everywhere.
@dataclass()
class Settings:
    api_token: str | None
    max_upload_bytes: int
    max_rows: int
    max_columns: int
    max_file_size_mb_excel: int

    @staticmethod
    def load() -> "Settings":
        env = os.environ
        return Settings(
            api_token=env.get("ANALYTICS_API_TOKEN") or None,
            # Hard safety ceilings independent of caller-supplied options.
            max_upload_bytes=int(env.get("ANALYTICS_MAX_UPLOAD_BYTES", str(250 * 1024 * 1024))),
            max_rows=int(env.get("ANALYTICS_MAX_ROWS", "5_000_000".replace("_", ""))),
            max_columns=int(env.get("ANALYTICS_MAX_COLUMNS", "500")),
            max_file_size_mb_excel=int(env.get("ANALYTICS_MAX_EXCEL_MB", "100")),
        )


settings = Settings.load()

ENGINE_VERSION = "1.0.0"
