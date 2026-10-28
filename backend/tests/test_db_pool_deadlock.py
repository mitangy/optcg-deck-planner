"""Requests must not deadlock between the worker threadpool and the DB pool (#802)."""

from __future__ import annotations

import asyncio
import time

import anyio.to_thread
import httpx
from fastapi import Depends, FastAPI
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import db as app_db
from app.auth import SESSION_COOKIE, create_session_token, get_current_user
from app.models import Base, User


def test_more_requests_than_threads_and_connections_all_finish_802(tmp_path, monkeypatch):
    # A file-backed SQLite engine gets a real QueuePool (in-memory SQLite does not),
    # which is the pool Postgres uses: one connection, no overflow, a short timeout.
    engine = create_engine(
        f"sqlite:///{tmp_path / 'pool.db'}",
        connect_args={"check_same_thread": False},
        pool_size=1,
        max_overflow=0,
        pool_timeout=2,
    )
    Base.metadata.create_all(bind=engine)
    monkeypatch.setattr(app_db, "engine", engine)
    monkeypatch.setattr(app_db, "SessionLocal", sessionmaker(bind=engine, autoflush=False, autocommit=False))
    with app_db.SessionLocal() as s:
        user = User(email="p@x.test", name="p", google_sub="sub-p")
        s.add(user)
        s.commit()
        uid = user.id

    app = FastAPI()

    @app.get("/me")
    def me(user: User = Depends(get_current_user), db=Depends(app_db.get_db)) -> dict:
        # A real route: auth reads the user (taking the only connection), then this
        # sync body needs a second worker thread while the connection is still held.
        time.sleep(0.05)
        return {"id": user.id}

    async def run() -> list[int]:
        # Only 2 worker threads for 6 requests: the threads that wait for the
        # single connection must not starve the request that holds it.
        anyio.to_thread.current_default_thread_limiter().total_tokens = 2
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
            c.cookies.set(SESSION_COOKIE, create_session_token(uid, 0))
            rs = await asyncio.wait_for(asyncio.gather(*[c.get("/me") for _ in range(6)]), 15)
        return [r.status_code for r in rs]

    async def main() -> list[int]:
        limiter = anyio.to_thread.current_default_thread_limiter()
        before = limiter.total_tokens
        try:
            return await run()
        finally:
            limiter.total_tokens = before

    try:
        assert asyncio.run(main()) == [200] * 6
    finally:
        engine.dispose()
