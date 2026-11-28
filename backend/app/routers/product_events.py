from __future__ import annotations

import json
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.admin import product_events as pe
from app.admin.models import ProductEvent
from app.core.auth import get_optional_user, touch_last_seen
from app.core.config import Settings, get_settings
from app.core.db import get_db
from app.core.models import User
from app.core.rate_limit import RateLimiter, client_ip
from app.reporter import identify_reporter

router = APIRouter(tags=["events"])

# The IP is only a rate-limit key (in memory or Redis, expiring); it is never written to the table.
_rate = RateLimiter(max_calls=30, period_s=60, name="product_events_rate")


@router.post("/events", status_code=204, response_class=Response)
async def record_events(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    session_user: Annotated[User | None, Depends(get_optional_user)],
    authorization: Annotated[str | None, Header()] = None,
) -> Response:
    """A batch of funnel events from the browser (``navigator.sendBeacon`` sends it as text/plain).

    The body is read by hand because a beacon cannot set a JSON content type without a CORS preflight.
    """
    if not _rate.allow(f"events:{client_ip(request)}"):
        raise HTTPException(status_code=429, detail="Too many events")
    body = await request.body()
    if len(body) > pe.MAX_BODY_BYTES:
        raise HTTPException(status_code=413, detail="Request body is too large")
    try:
        data = json.loads(body or b"{}")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON") from None
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="Invalid body")

    app = data.get("app")
    events = pe.clean_batch(data.get("events"))
    if app not in pe.APPS or not events:
        return Response(status_code=204)
    user = identify_reporter(db, settings, session_user, authorization)
    anon_id = pe.clean_anon_id(data.get("anon_id"))
    if user is None and anon_id is None:
        return Response(status_code=204)
    device = pe.device_of(request.headers.get("user-agent"))
    for name, props in events:
        db.add(
            ProductEvent(
                user_id=user.id if user is not None else None,
                anon_id=anon_id,
                app=app,
                name=name,
                device=device,
                props=props,
            )
        )
    db.commit()
    if user is not None:
        touch_last_seen(db, user)
    return Response(status_code=204)
