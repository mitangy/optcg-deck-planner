from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from app.body_limit import BodySizeLimitMiddleware
from app.config import get_settings
from app.cors import TieredCORSMiddleware
from app.db import init_db
from app.routers import analyst, analyst_chat, api, auth, duel, duel_prefs, friends

settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    # Re-flag alt printings when SPECIAL_NAME_MARKERS expands (no TCGCSV wait).
    from app.catalog_sync import refresh_special_flags
    from app.db import SessionLocal

    from app.analyst_stats import backfill_seats

    db = SessionLocal()
    try:
        refresh_special_flags(db)
        backfill_seats(db)
    finally:
        db.close()
    yield


_docs = None if settings.is_production else "/docs"
_redoc = None if settings.is_production else "/redoc"
_openapi = None if settings.is_production else "/openapi.json"

app = FastAPI(
    title=settings.app_name,
    lifespan=lifespan,
    docs_url=_docs,
    redoc_url=_redoc,
    openapi_url=_openapi,
)

_cors_origins = [settings.frontend_origin.rstrip("/")]
_cors_origins.extend(settings.duel_cors_origin_list)
if not settings.is_production:
    _cors_origins.extend(
        [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:5174",
            "http://127.0.0.1:5174",
            "http://localhost:8081",
            "http://127.0.0.1:8081",
        ]
    )
# de-dupe while preserving order
_seen: set[str] = set()
_cors_unique: list[str] = []
for o in _cors_origins:
    if o not in _seen:
        _seen.add(o)
        _cors_unique.append(o)
_cors_origins = _cors_unique

# Inside CORS, so a 413 still carries the CORS headers the browser needs to read it.
app.add_middleware(BodySizeLimitMiddleware)
app.add_middleware(
    TieredCORSMiddleware,
    credentialed_origins=_cors_origins,
    credentialless_regex=settings.duel_cors_origin_regex or None,
)

app.include_router(auth.router)
app.include_router(api.router)
app.include_router(duel.router)
app.include_router(friends.router)
app.include_router(duel_prefs.router)
app.include_router(analyst.router)
app.include_router(analyst_chat.router)


@app.get("/")
def root():
    """Friendly landing for the raw Render URL (browsing / used to 404)."""
    payload = {
        "ok": True,
        "app": settings.app_name,
        "health": "/health",
        "frontend": settings.frontend_origin.rstrip("/"),
        "note": "This is the API. Use the frontend URL to sign in and manage decks.",
    }
    if not settings.is_production:
        payload["docs"] = "/docs"
    return payload


@app.get("/health")
def health():
    return {"ok": True, "app": settings.app_name, "api_revision": 10}
