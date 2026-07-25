from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import init_db
from app.routers import api, auth

settings = get_settings()

app = FastAPI(title=settings.app_name)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


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


@app.get("/health")
def health():
    return {"ok": True, "app": settings.app_name}
