from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import init_db
from app.routers import api, auth

settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    # Re-flag alt printings when SPECIAL_NAME_MARKERS expands (no TCGCSV wait).
    from app.catalog_sync import refresh_special_flags
    from app.db import SessionLocal

    db = SessionLocal()
    try:
        refresh_special_flags(db)
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
if not settings.is_production:
    _cors_origins.extend(
        [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ]
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(api.router)


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
    return {"ok": True, "app": settings.app_name, "api_revision": 9}
