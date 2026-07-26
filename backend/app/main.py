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
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_origin.rstrip("/"),
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(api.router)


@app.get("/")
def root():
    """Friendly landing for the raw Render URL (browsing / used to 404)."""
    return {
        "ok": True,
        "app": settings.app_name,
        "health": "/health",
        "docs": "/docs",
        "frontend": settings.frontend_origin.rstrip("/"),
        "note": "This is the API. Use the frontend URL to sign in and manage decks.",
    }


@app.get("/health")
def health():
    return {"ok": True, "app": settings.app_name, "api_revision": 9}
