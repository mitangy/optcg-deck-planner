from __future__ import annotations

from typing import Annotated

from authlib.integrations.httpx_client import AsyncOAuth2Client
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import (
    SESSION_COOKIE,
    create_session_token,
    email_allowed,
    get_optional_user,
)
from app.config import Settings, get_settings
from app.db import get_db
from app.models import User
from app.schemas import UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


def _google_client(settings: Settings) -> AsyncOAuth2Client:
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(
            status_code=503,
            detail="Google OAuth is not configured (set GOOGLE_CLIENT_ID/SECRET)",
        )
    return AsyncOAuth2Client(
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        redirect_uri=f"{settings.backend_public_url.rstrip('/')}/auth/callback",
        scope="openid email profile",
    )


@router.get("/google")
async def google_login(settings: Annotated[Settings, Depends(get_settings)]):
    client = _google_client(settings)
    uri, _state = client.create_authorization_url(
        "https://accounts.google.com/o/oauth2/v2/auth",
        access_type="online",
        prompt="select_account",
    )
    return RedirectResponse(uri)


@router.get("/callback")
async def google_callback(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
):
    client = _google_client(settings)
    try:
        token = await client.fetch_token(
            "https://oauth2.googleapis.com/token",
            authorization_response=str(request.url),
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"OAuth failed: {exc}") from exc

    # Newer httpx/Authlib: token is stored on the client after fetch_token;
    # AsyncClient.get() no longer accepts a token= kwarg.
    access_token = token.get("access_token") if isinstance(token, dict) else None
    if not access_token:
        raise HTTPException(status_code=400, detail="OAuth token missing access_token")
    resp = await client.get(
        "https://openidconnect.googleapis.com/v1/userinfo",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    if resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to fetch Google profile")
    profile = resp.json()
    email = (profile.get("email") or "").strip().lower()
    sub = profile.get("sub") or ""
    name = profile.get("name") or email
    if not email or not sub:
        raise HTTPException(status_code=400, detail="Google profile missing email")
    if not email_allowed(email, settings):
        raise HTTPException(status_code=403, detail="Email not on allowlist")

    user = db.scalar(select(User).where(User.google_sub == sub))
    if user is None:
        user = db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(email=email, name=name, google_sub=sub)
        db.add(user)
    else:
        user.email = email
        user.name = name
        user.google_sub = sub
    db.commit()
    db.refresh(user)

    response = RedirectResponse(settings.frontend_origin.rstrip("/") + "/")
    cross_site = not settings.frontend_origin.rstrip("/").startswith(
        ("http://localhost", "http://127.0.0.1")
    )
    response.set_cookie(
        key=SESSION_COOKIE,
        value=create_session_token(user.id, settings),
        httponly=True,
        samesite="none" if cross_site else "lax",
        secure=cross_site or settings.backend_public_url.startswith("https"),
        max_age=60 * 60 * 24 * 30,
        path="/",
    )
    return response


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}


@router.get("/me", response_model=UserOut | None)
def me(user: Annotated[User | None, Depends(get_optional_user)]):
    return user


@router.post("/dev-login", response_model=UserOut)
def dev_login(
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
):
    """Local-only login when Google OAuth is not configured."""
    if settings.google_client_id and settings.google_client_secret:
        raise HTTPException(status_code=400, detail="Use Google login in this environment")
    email = "dev@localhost"
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(email=email, name="Dev User", google_sub="dev-local")
        db.add(user)
        db.commit()
        db.refresh(user)
    response.set_cookie(
        key=SESSION_COOKIE,
        value=create_session_token(user.id, settings),
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=60 * 60 * 24 * 30,
        path="/",
    )
    return user
