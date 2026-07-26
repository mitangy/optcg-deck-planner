from __future__ import annotations

from typing import Annotated
from urllib.parse import urlparse

from authlib.integrations.httpx_client import AsyncOAuth2Client
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import (
    SESSION_COOKIE,
    create_login_ticket,
    create_oauth_state,
    create_session_token,
    email_allowed,
    get_optional_user,
    read_login_ticket,
    resolve_google_user,
    verify_oauth_state,
)
from app.config import Settings, get_settings
from app.db import get_db
from app.models import User
from app.schemas import UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


class ClaimBody(BaseModel):
    ticket: str = Field(min_length=1)


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


def _cookie_flags(settings: Settings) -> dict:
    """Prefer SameSite=Lax when API and frontend share a host (Vercel /api proxy)."""
    api_host = urlparse(settings.backend_public_url).hostname
    fe_host = urlparse(settings.frontend_origin).hostname
    cross_site = bool(api_host and fe_host and api_host != fe_host)
    secure = settings.backend_public_url.startswith("https") or settings.frontend_origin.startswith(
        "https"
    )
    return {
        "httponly": True,
        "samesite": "none" if cross_site else "lax",
        "secure": True if cross_site else secure,
        "max_age": 60 * 60 * 24 * 30,
        "path": "/",
    }


def _set_session_cookie(
    response: Response,
    user: User,
    settings: Settings,
) -> None:
    response.set_cookie(
        key=SESSION_COOKIE,
        value=create_session_token(user.id, int(user.session_version or 0), settings),
        **_cookie_flags(settings),
    )


@router.get("/google")
async def google_login(settings: Annotated[Settings, Depends(get_settings)]):
    client = _google_client(settings)
    # Signed state in the OAuth URL — no cookie needed (more reliable on mobile Safari).
    uri, _ = client.create_authorization_url(
        "https://accounts.google.com/o/oauth2/v2/auth",
        state=create_oauth_state(settings),
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
    got_state = request.query_params.get("state") or ""
    if not verify_oauth_state(got_state, settings):
        raise HTTPException(status_code=400, detail="Invalid OAuth state")

    client = _google_client(settings)
    public_callback = f"{settings.backend_public_url.rstrip('/')}/auth/callback"
    query = request.url.query
    authorization_response = f"{public_callback}?{query}" if query else public_callback
    try:
        token = await client.fetch_token(
            "https://oauth2.googleapis.com/token",
            authorization_response=authorization_response,
        )
    except Exception as exc:  # noqa: BLE001
        # Do not echo provider/transport internals to the client.
        raise HTTPException(status_code=400, detail="OAuth failed") from exc

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
    if profile.get("email_verified") is not True:
        raise HTTPException(status_code=400, detail="Google email is not verified")
    if not email_allowed(email, settings):
        raise HTTPException(status_code=403, detail="Email not on allowlist")

    user = resolve_google_user(db, email=email, sub=sub, name=name)

    # One-time ticket claimed by the SPA via same-origin POST so the session
    # cookie is set on a fetch response (works on mobile Safari; proxy redirects often drop Set-Cookie).
    ticket = create_login_ticket(user.id, settings)
    return RedirectResponse(
        f"{settings.frontend_origin.rstrip('/')}/login?ticket={ticket}"
    )


@router.post("/claim", response_model=UserOut)
def claim_login(
    body: ClaimBody,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
):
    user_id = read_login_ticket(body.ticket, settings)
    if user_id is None:
        raise HTTPException(status_code=400, detail="Invalid or expired login ticket")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=400, detail="User not found")
    _set_session_cookie(response, user, settings)
    return user


@router.post("/logout")
def logout(
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    user: Annotated[User | None, Depends(get_optional_user)],
):
    # Bump session_version so any stolen cookie stops working immediately.
    if user is not None:
        user.session_version = int(user.session_version or 0) + 1
        db.commit()
    flags = _cookie_flags(settings)
    response.delete_cookie(
        SESSION_COOKIE,
        path=flags["path"],
        samesite=flags["samesite"],
        secure=flags["secure"],
    )
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
    """Local-only login. Disabled unless ENABLE_DEV_LOGIN=true."""
    if not settings.enable_dev_login:
        raise HTTPException(status_code=404, detail="Not found")
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
        value=create_session_token(user.id, int(user.session_version or 0), settings),
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=60 * 60 * 24 * 30,
        path="/",
    )
    return user
