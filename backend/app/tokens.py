"""Shared-secret guards as FastAPI dependencies (D-06).

Attach them with ``dependencies=[Depends(...)]`` on the route so the check cannot be
forgotten inside a handler body.

* ``require_catalog_token``: catalog sync and price-history import (CATALOG_SYNC_TOKEN,
  held by the catalog-sync and price-history-backfill workflows).
* ``require_ops_token``: game-server pool pointer, card reports and feedback triage
  (OPS_ADMIN_TOKEN). While OPS_ADMIN_TOKEN is unset it accepts CATALOG_SYNC_TOKEN, so
  nothing breaks before the secret exists; once set, the catalog token no longer works here.
"""

from __future__ import annotations

import hmac
from typing import Annotated

from fastapi import Depends, Header, HTTPException

from app.config import Settings, get_settings


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
