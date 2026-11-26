"""Instagram routes (#1477): the public image Instagram fetches, and admin tools."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import Admin
from app.instagram import content
from app.instagram.models import InstagramPost

public_router = APIRouter(tags=["instagram"])
admin_router = APIRouter(prefix="/admin/instagram", tags=["instagram"])

DB = Annotated[Session, Depends(get_db)]


@public_router.get("/social-media/{media_token}.jpg", include_in_schema=False)
def post_image(media_token: str, db: DB) -> Response:
    """No auth: Instagram's servers fetch this. The random token is the only key."""
    jpeg = db.scalar(select(InstagramPost.image_jpeg).where(InstagramPost.media_token == media_token))
    if jpeg is None:
        raise HTTPException(status_code=404, detail="Not found")
    return Response(content=jpeg, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})


@admin_router.get("/posts")
def list_posts(_: Admin, db: DB, limit: Annotated[int, Query(ge=1, le=100)] = 30) -> dict:
    rows = db.scalars(select(InstagramPost).order_by(InstagramPost.slot_date.desc()).limit(limit)).all()
    return {
        "posts": [
            {
                "id": r.id,
                "kind": r.kind,
                "slot_date": r.slot_date.isoformat(),
                "subject": r.subject,
                "status": r.status,
                "attempts": r.attempts,
                "ig_media_id": r.ig_media_id,
                "error": r.error,
                "caption": r.caption,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "published_at": r.published_at.isoformat() if r.published_at else None,
            }
            for r in rows
        ]
    }


@admin_router.post("/preview")
async def preview(_: Admin, db: DB, kind: Annotated[Literal["meta_chart", "card_spotlight", "feature"], Query()]) -> Response:
    """A freshly rendered post image, not saved or published. The caption comes back in X-Caption (url-quoted)."""
    from urllib.parse import quote

    today = datetime.now(timezone.utc).date()
    async with httpx.AsyncClient() as http:
        post = await content.build_post(db, kind, today, http)
    if post is None:
        raise HTTPException(status_code=422, detail="Nothing to post for that kind right now")
    return Response(content=post.image, media_type="image/jpeg", headers={"X-Caption": quote(post.caption)})
