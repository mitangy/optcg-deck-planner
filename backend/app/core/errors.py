"""Domain errors that map to an HTTP response through one exception handler.

Service code raises these instead of returning HTTP concerns; `register` installs the
single handler that turns them into the `{"detail": ...}` body FastAPI's HTTPException
produced before (refactor 2.1c, D-04).

`NotFound`, `Invalid` and `Forbidden` also subclass the built-in exception they replace,
so a caller that still catches `LookupError`, `ValueError` or `PermissionError` keeps
working.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class DomainError(Exception):
    """A request the API refuses. `detail` is the response's `detail` (the message by default)."""

    status_code = 400

    def __init__(
        self,
        message: str = "",
        *,
        detail: Any = None,
        status_code: int | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.detail = message if detail is None else detail
        if status_code is not None:
            self.status_code = status_code
        self.headers = headers


class NotFound(DomainError, LookupError):
    status_code = 404


class Invalid(DomainError, ValueError):
    status_code = 400


class Forbidden(DomainError, PermissionError):
    status_code = 403


class Conflict(DomainError):
    status_code = 409


async def _domain_error_response(_request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, DomainError)
    return JSONResponse(
        {"detail": exc.detail},
        status_code=exc.status_code,
        headers=dict(exc.headers) if exc.headers else None,
    )


def register(app: FastAPI) -> None:
    app.add_exception_handler(DomainError, _domain_error_response)
