"""Shared-secret, role and service-secret guards as FastAPI dependencies (D-06, D-02).

Attach them with ``dependencies=[Depends(...)]`` on the route so the check cannot be
forgotten inside a handler body.

* ``require_catalog_token``: catalog sync and price-history import (CATALOG_SYNC_TOKEN,
  held by the catalog-sync and price-history-backfill workflows).
* ``require_ops_token``: game-server pool pointer, card reports and feedback triage
  (OPS_ADMIN_TOKEN). While OPS_ADMIN_TOKEN is unset it accepts CATALOG_SYNC_TOKEN, so
  nothing breaks before the secret exists; once set, the catalog token no longer works here.
* ``require_staff`` / ``require_admin`` (``Staff`` / ``Admin``): signed-in role checks.
* ``require_service``: the Log Pose analyst service secret (ANALYST_SERVICE_SECRET).

Routers import these from here, never from each other.
"""

from __future__ import annotations

import hmac
from typing import Annotated

from fastapi import Depends, Header, HTTPException

from app.core.auth import get_current_user
from app.core.config import Settings, get_settings
from app.models import User
from app.roles import is_admin, is_staff


def _matches(provided: str | None, expected: str) -> bool:
    return bool(expected) and hmac.compare_digest((provided or "").encode(), expected.encode())


def require_catalog_token(
    settings: Annotated[Settings, Depends(get_settings)],
    x_catalog_token: Annotated[str | None, Header()] = None,
) -> None:
    if not _matches(x_catalog_token, settings.catalog_sync_token):
        raise HTTPException(status_code=401, detail="Invalid catalog sync token")


def require_ops_token(
    settings: Annotated[Settings, Depends(get_settings)],
    x_ops_token: Annotated[str | None, Header()] = None,
    x_catalog_token: Annotated[str | None, Header()] = None,
) -> None:
    # Fallback while OPS_ADMIN_TOKEN is unset; the old header name is still read so
    # existing curl calls keep working after the secret is split.
    expected = settings.ops_admin_token or settings.catalog_sync_token
    if not _matches(x_ops_token or x_catalog_token, expected):
        raise HTTPException(status_code=401, detail="Invalid ops admin token")


CatalogToken = Depends(require_catalog_token)
OpsToken = Depends(require_ops_token)


def require_staff(user: Annotated[User, Depends(get_current_user)]) -> User:
    if not is_staff(user):
        raise HTTPException(status_code=403, detail="Staff only")
    return user


def require_admin(user: Annotated[User, Depends(get_current_user)]) -> User:
    if not is_admin(user):
        raise HTTPException(status_code=403, detail="Admin only")
    return user


Staff = Annotated[User, Depends(require_staff)]
Admin = Annotated[User, Depends(require_admin)]


def require_service(settings: Settings, given: str | None) -> None:
    expected = settings.analyst_service_secret
    if not expected:
        raise HTTPException(status_code=503, detail="Replays are not enabled")
    if not given or not hmac.compare_digest(given, expected):
        raise HTTPException(status_code=403, detail="Analyst service only")
