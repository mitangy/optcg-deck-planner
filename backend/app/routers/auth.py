from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Annotated
from urllib.parse import urlparse

from authlib.integrations.httpx_client import AsyncOAuth2Client
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import (
    OAUTH_NONCE_COOKIE,
    OAUTH_RETURN_COOKIE,
    OAUTH_STATE_MAX_AGE_SECONDS,
    SESSION_COOKIE,
    consume_login_ticket,
    create_login_ticket,
    create_oauth_state,
    create_session_token,
    email_allowed,
    get_current_user,
    get_optional_user,
    new_oauth_nonce,
    resolve_google_user,
    verify_oauth_state,
)
from app.config import Settings, get_settings
from app.db import get_db
from app.models import User
from app.rate_limit import RateLimiter
from app.roles import is_banned
from app.schemas import UsernameSuggestionOut, UsernameUpdate, UserOut
from app.usernames import (
    UsernameError,
    suggest_username,
    username_taken,
    validate_username,
)

router = APIRouter(prefix="/auth", tags=["auth"])

_username_rate = RateLimiter(max_calls=20, period_s=60, name="auth_username_rate")


_SOURCE_CAPS = {"ref": 80, "land": 100, "utm_source": 60, "utm_medium": 60, "utm_campaign": 60}
# An account counts as brand new (so its sign-in is its first touch) for this long.
_NEW_ACCOUNT_WINDOW = timedelta(hours=1)


class SignupSource(BaseModel):
    """First-touch source sent by the client at sign-in (#905).

    Every field is optional and cut to its cap (never rejected: a long value
    must not fail a sign-in). Control characters are stripped; unknown fields
    are ignored.
    """

    model_config = ConfigDict(extra="ignore")

    ref: str | None = None
    land: str | None = None
    utm_source: str | None = None
    utm_medium: str | None = None
    utm_campaign: str | None = None

    @field_validator("ref", "land", "utm_source", "utm_medium", "utm_campaign", mode="before")
    @classmethod
    def _clean(cls, v: object, info) -> str | None:
        if not isinstance(v, str):
            return None
        cleaned = "".join(ch for ch in v if ch.isprintable()).strip()
        return cleaned[: _SOURCE_CAPS[info.field_name]] or None

    def compact_json(self) -> str:
        return json.dumps(
            {k: v for k, v in self.model_dump().items() if v}, ensure_ascii=False, separators=(",", ":")
        )


class ClaimBody(BaseModel):
    ticket: str = Field(min_length=1)
    source: SignupSource | None = None


def _oauth_api_base(settings: Settings, return_to: str | None) -> str:
    """Public API base whose /auth/callback Google should return to.

    Login must start and finish on the same host so the nonce cookie set by
    /auth/google is present at /auth/callback. SPAs that proxy /api to this
    API (OAUTH_CALLBACK_ORIGINS, e.g. duel-web) therefore get their own
    callback; everything else uses BACKEND_PUBLIC_URL (the planner).
    """
    if return_to and return_to in settings.oauth_callback_origin_list:
        return f"{return_to}/api"
    return settings.backend_public_url.rstrip("/")


def _google_client(settings: Settings, api_base: str) -> AsyncOAuth2Client:
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(
            status_code=503,
            detail="Google OAuth is not configured (set GOOGLE_CLIENT_ID/SECRET)",
        )
    return AsyncOAuth2Client(
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        redirect_uri=f"{api_base}/auth/callback",
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


def _allowed_return_origins(settings: Settings) -> set[str]:
    origins = {settings.frontend_origin.rstrip("/")}
    origins.update(settings.duel_cors_origin_list)
    return origins


def _sanitize_return_to(raw: str | None, settings: Settings) -> str | None:
    """Allow only absolute http(s) origins on the planner / duel CORS allowlist."""
    if not raw:
        return None
    try:
        parsed = urlparse(raw.strip())
    except Exception:
        return None
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return None
    if parsed.path not in ("", "/"):
        # Origin only — path is fixed to /auth/complete on redirect.
        origin = f"{parsed.scheme}://{parsed.netloc}"
    else:
        origin = f"{parsed.scheme}://{parsed.netloc}"
    if origin.rstrip("/") not in _allowed_return_origins(settings):
        return None
    return origin.rstrip("/")


@router.get("/google")
async def google_login(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    return_to: str | None = None,
):
    # Optional return origin for duel-web (or other allowlisted SPA). Defaults to planner.
    safe_return = _sanitize_return_to(return_to or request.query_params.get("return_to"), settings)
    client = _google_client(settings, _oauth_api_base(settings, safe_return))
    # Bind signed state to a short-lived nonce cookie on this host so a stolen
    # state alone cannot complete login CSRF.
    nonce = new_oauth_nonce()
    uri, _ = client.create_authorization_url(
        "https://accounts.google.com/o/oauth2/v2/auth",
        state=create_oauth_state(nonce, settings),
        access_type="online",
        prompt="select_account",
    )
    response = RedirectResponse(uri)
    secure = settings.backend_public_url.startswith("https") or settings.frontend_origin.startswith(
        "https"
    )
    response.set_cookie(
        key=OAUTH_NONCE_COOKIE,
        value=nonce,
        httponly=True,
        samesite="lax",
        secure=secure,
        max_age=OAUTH_STATE_MAX_AGE_SECONDS,
        path="/",
    )
    if safe_return:
        response.set_cookie(
            key=OAUTH_RETURN_COOKIE,
            value=safe_return,
            httponly=True,
            samesite="lax",
            secure=secure,
            max_age=OAUTH_STATE_MAX_AGE_SECONDS,
            path="/",
        )
    else:
        response.delete_cookie(OAUTH_RETURN_COOKIE, path="/")
    return response


@router.get("/callback")
async def google_callback(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
):
    got_state = request.query_params.get("state") or ""
    nonce = request.cookies.get(OAUTH_NONCE_COOKIE)
    if not verify_oauth_state(got_state, nonce, settings):
        raise HTTPException(status_code=400, detail="Invalid OAuth state")

    # Same host as /auth/google, so the return cookie is here too and picks the
    # same redirect_uri Google was given (required for the token exchange).
    return_to = _sanitize_return_to(request.cookies.get(OAUTH_RETURN_COOKIE), settings)
    api_base = _oauth_api_base(settings, return_to)
    client = _google_client(settings, api_base)
    public_callback = f"{api_base}/auth/callback"
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
    # Put the ticket in the URL fragment (not the query string) so it is not
    # sent to servers, proxies, or Referer headers.
    dest_origin = return_to or settings.frontend_origin.rstrip("/")
    # Duel-web claims at /auth/complete; planner SPA still uses /login.
    dest_path = "/auth/complete" if return_to else "/login"
    if is_banned(user):
        # No ticket for a banned account; the SPA shows "This account has been banned." (#667).
        redirect = RedirectResponse(f"{dest_origin}{dest_path}#error=banned")
    else:
        ticket = create_login_ticket(db, user.id, settings)
        redirect = RedirectResponse(f"{dest_origin}{dest_path}#ticket={ticket}")
    secure = settings.backend_public_url.startswith("https") or settings.frontend_origin.startswith(
        "https"
    )
    redirect.delete_cookie(
        OAUTH_NONCE_COOKIE,
        path="/",
        samesite="lax",
        secure=secure,
    )
    redirect.delete_cookie(
        OAUTH_RETURN_COOKIE,
        path="/",
        samesite="lax",
        secure=secure,
    )
    return redirect


@router.post("/claim", response_model=UserOut)
def claim_login(
    body: ClaimBody,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
):
    user_id = consume_login_ticket(db, body.ticket, settings)
    if user_id is None:
        raise HTTPException(status_code=400, detail="Invalid or expired login ticket")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=400, detail="User not found")
    if is_banned(user):
        raise HTTPException(status_code=403, detail="Account banned")
    _record_signup_source(db, user, body.source)
    _set_session_cookie(response, user, settings)
    return user


def _record_signup_source(db: Session, user: User, source: SignupSource | None) -> None:
    """Save where a brand-new account came from; returning users are never relabelled (#905).

    NULL stays "unknown" (signed up before tracking); "{}" means direct.
    """
    if user.signup_source is not None or user.created_at is None:
        return
    created = user.created_at
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) - created > _NEW_ACCOUNT_WINDOW:
        return
    user.signup_source = source.compact_json() if source is not None else "{}"
    db.commit()


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


@router.get("/me/username-suggestion", response_model=UsernameSuggestionOut)
def username_suggestion(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """An available username derived from the account name (prefill for the picker)."""
    if user.username:
        return UsernameSuggestionOut(username=user.username)
    return UsernameSuggestionOut(username=suggest_username(db, user))


@router.patch("/me/username", response_model=UserOut)
def set_username(
    body: UsernameUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Set or change the public duel username.

    422 when the name fails validation, 409 when another account already holds
    it (case-insensitive). Re-submitting your own name with different casing is
    allowed.
    """
    if not _username_rate.allow(f"username:{user.id}"):
        raise HTTPException(status_code=429, detail="Too many username changes; try again soon")
    try:
        username = validate_username(body.username)
    except UsernameError as e:
        raise HTTPException(status_code=422, detail=str(e)) from None
    if username_taken(db, username, exclude_user_id=user.id):
        raise HTTPException(status_code=409, detail="That username is already taken.")
    user.username = username
    try:
        db.commit()
    except IntegrityError:
        # Lost a race against a concurrent claim of the same name.
        db.rollback()
        raise HTTPException(status_code=409, detail="That username is already taken.") from None
    db.refresh(user)
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
