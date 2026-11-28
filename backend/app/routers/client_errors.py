from __future__ import annotations

import logging
import os
import traceback
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.admin.client_errors import record_client_error
from app.admin.schemas import ClientErrorIn
from app.core.auth import get_optional_user
from app.core.config import Settings, get_settings
from app.core.db import get_db, get_session_factory
from app.core.models import User
from app.core.rate_limit import RateLimiter, client_ip
from app.reporter import identify_reporter

router = APIRouter(prefix="/client-errors", tags=["client-errors"])

log = logging.getLogger(__name__)

# A broken page can throw in a loop; the apps cap themselves too, this keeps one bad browser from filling the table.
_client_error_rate = RateLimiter(max_calls=30, period_s=600, name="client_errors_rate")
_client_error_global_rate = RateLimiter(max_calls=600, period_s=3600, name="client_errors_global_rate")
_api_error_rate = RateLimiter(max_calls=120, period_s=60, name="api_errors_rate")


@router.post("", status_code=204)
def report_client_error(
    body: ClientErrorIn,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    session_user: Annotated[User | None, Depends(get_optional_user)],
    authorization: Annotated[str | None, Header()] = None,
) -> Response:
    """Record an uncaught error from the planner or duel app (signed in or not)."""
    if not _client_error_rate.allow(f"ce:{client_ip(request)}") or not _client_error_global_rate.allow("ce"):
        raise HTTPException(status_code=429, detail="Too many error reports")
    user = identify_reporter(db, settings, session_user, authorization)
    record_client_error(
        db,
        app=body.app,
        message=body.message,
        stack=body.stack,
        url=body.url,
        release=body.release,
        user_id=user.id if user is not None else None,
    )
    return Response(status_code=204)


def _record_api_error(request: Request, exc: Exception) -> None:
    factory = request.app.dependency_overrides.get(get_session_factory, get_session_factory)()
    db = factory()
    try:
        # Type and message only: never the request body, headers or query string.
        record_client_error(
            db,
            app="api",
            message=f"{type(exc).__name__}: {exc}",
            stack="".join(traceback.format_exception(type(exc), exc, exc.__traceback__)),
            url=request.url.path,
            release=os.environ.get("RENDER_GIT_COMMIT", "")[:7],
        )
    finally:
        db.close()


async def unhandled_exception_response(request: Request, exc: Exception) -> JSONResponse:
    """Record an unhandled server exception and answer the way Starlette would."""
    if _api_error_rate.allow("api"):
        try:
            await run_in_threadpool(_record_api_error, request, exc)
        except Exception:
            # Reporting must never turn one failure into another.
            log.warning("could not record an unhandled error", exc_info=True)
    return JSONResponse({"detail": "Internal Server Error"}, status_code=500)
