from __future__ import annotations

import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.admin import product_events as pe
from app.admin.models import ProductEvent
from app.core.auth import get_optional_user
from app.core.db import get_db
from app.core.models import User
from app.core.rate_limit import RateLimiter, client_ip
from app.core.time import utcnow

router = APIRouter(tags=["events"])

# The IP is only a rate-limit key (in memory or Redis, expiring); it is never written to the table.
# A tab flushes about every 10 s, so 10 a minute per browser id and 20 per address (shared networks) are generous.
_rate = RateLimiter(max_calls=20, period_s=60, name="product_events_rate")
_anon_rate = RateLimiter(max_calls=10, period_s=60, name="product_events_anon_rate")


async def _read_body(request: Request) -> bytes:
    # Reading the body is the only async part, so the handler itself can be a plain def that runs in the threadpool.
    return await request.body()


@router.post("/events", status_code=204, response_class=Response)
def record_events(
    request: Request,
    body: Annotated[bytes, Depends(_read_body)],
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User | None, Depends(get_optional_user)],
) -> Response:
    """A batch of funnel events from the browser (``navigator.sendBeacon`` sends it as text/plain).

    The body is parsed by hand because a beacon cannot set a JSON content type without a CORS preflight.
    """
    if not _rate.allow(f"events:{client_ip(request)}"):
        raise HTTPException(status_code=429, detail="Too many events")
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
    anon_id = pe.clean_anon_id(data.get("anon_id"))
    if app not in pe.APPS or not events or (user is None and anon_id is None):
        return Response(status_code=204)
    if anon_id is not None and not _anon_rate.allow(f"events-anon:{anon_id}"):
        raise HTTPException(status_code=429, detail="Too many events")

    now = utcnow()
    once = {name for name, _ in events} & pe.ONCE_A_DAY
    seen = (
        pe.already_today(db, once, user_id=user.id if user else None, anon_id=anon_id, since=now.replace(hour=0, minute=0, second=0, microsecond=0))
        if once
        else set()
    )
    device = pe.device_of(request.headers.get("user-agent"))
    for name, props in events:
        if name in seen:
            continue
        if name in pe.ONCE_A_DAY:
            seen.add(name)
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
    return Response(status_code=204)
