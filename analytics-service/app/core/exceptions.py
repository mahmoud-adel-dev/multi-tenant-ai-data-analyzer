"""Typed exceptions mapped to HTTP status codes by the API layer."""
from __future__ import annotations


class AnalyticsError(Exception):
    """Base class for all analytics service errors."""

    status_code = 500
    code = "ANALYSIS_ERROR"

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class MalformedFileError(AnalyticsError):
    status_code = 400
    code = "MALFORMED_FILE"


class UnsupportedFileError(AnalyticsError):
    status_code = 415
    code = "UNSUPPORTED_FILE"


class FileTooLargeError(AnalyticsError):
    status_code = 413
    code = "FILE_TOO_LARGE"
