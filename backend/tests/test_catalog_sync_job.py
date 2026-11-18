from __future__ import annotations

import threading
from unittest.mock import MagicMock

import pytest

from sqlalchemy import text

from app.planner import catalog_sync
from app.core import db as app_db
from tests.db_support import make_bare_engine, requires_postgres


@pytest.fixture(autouse=True)
def _reset_sync_state():
    if catalog_sync._sync_lock.locked():  # pragma: no cover - safety
        catalog_sync._sync_lock.release()
    catalog_sync._sync_state.update(
        running=False,
        started_at=None,
        finished_at=None,
        last_result=None,
        last_error=None,
    )
    yield


def test_run_job_uses_own_session_and_records_result(monkeypatch):
    fake_session = MagicMock()
    calls: list[object] = []

    def fake_sync(db):
        calls.append(db)
        return {"card_count": 3, "printing_count": 5}

    monkeypatch.setattr(catalog_sync, "sync_catalog", fake_sync)

    result = catalog_sync.run_catalog_sync_job(session_factory=lambda: fake_session)

    assert result == {"card_count": 3, "printing_count": 5}
    assert calls == [fake_session]
    fake_session.close.assert_called_once()
    status = catalog_sync.sync_status()
    assert status["running"] is False
    assert status["last_result"] == {"card_count": 3, "printing_count": 5}
    assert status["last_error"] is None
    assert not catalog_sync.sync_in_progress()


def test_concurrent_job_is_skipped_while_one_runs(monkeypatch):
    started = threading.Event()
    release = threading.Event()

    def blocking_sync(db):
        started.set()
        release.wait(timeout=5)
        return {"card_count": 1, "printing_count": 1}

    monkeypatch.setattr(catalog_sync, "sync_catalog", blocking_sync)

    worker = threading.Thread(
        target=catalog_sync.run_catalog_sync_job,
        kwargs={"session_factory": MagicMock()},
    )
    worker.start()
    assert started.wait(timeout=5)
    assert catalog_sync.sync_in_progress()

    second_session = MagicMock()
    assert catalog_sync.run_catalog_sync_job(session_factory=lambda: second_session) is None
    second_session.assert_not_called()

    release.set()
    worker.join(timeout=5)
    assert not catalog_sync.sync_in_progress()


def test_job_records_error_and_reraises(monkeypatch):
    def failing_sync(db):
        raise RuntimeError("tcgcsv down")

    monkeypatch.setattr(catalog_sync, "sync_catalog", failing_sync)

    with pytest.raises(RuntimeError, match="tcgcsv down"):
        catalog_sync.run_catalog_sync_job(session_factory=MagicMock())

    status = catalog_sync.sync_status()
    assert status["running"] is False
    assert status["last_error"] == "tcgcsv down"
    assert not catalog_sync._sync_lock.locked()


def test_try_claim_marks_running_before_job_body(monkeypatch):
    assert catalog_sync.try_claim_sync_slot()
    status = catalog_sync.sync_status()
    assert status["running"] is True
    assert status["finished_at"] is None
    assert status["started_at"] is not None

    assert not catalog_sync.try_claim_sync_slot()

    monkeypatch.setattr(
        catalog_sync,
        "sync_catalog",
        lambda db: {"card_count": 1, "printing_count": 1},
    )
    result = catalog_sync.run_catalog_sync_job(
        session_factory=MagicMock(),
        already_claimed=True,
    )
    assert result == {"card_count": 1, "printing_count": 1}
    assert not catalog_sync.sync_in_progress()
    assert catalog_sync.sync_status()["finished_at"] is not None


@requires_postgres
def test_catalog_sync_waits_out_another_workers_run_682(monkeypatch):
    engine = make_bare_engine()
    monkeypatch.setattr(app_db, "engine", engine)
    with engine.connect() as other_worker:
        other_worker.execute(text("SELECT pg_advisory_lock(:key)"), {"key": app_db.CATALOG_SYNC_LOCK_KEY})
        assert not catalog_sync.try_claim_sync_slot()
        assert not catalog_sync._sync_lock.locked()
        assert not catalog_sync.sync_in_progress()
        other_worker.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": app_db.CATALOG_SYNC_LOCK_KEY})
        other_worker.commit()

    monkeypatch.setattr(catalog_sync, "sync_catalog", lambda db: {"card_count": 1, "printing_count": 1})
    assert catalog_sync.run_catalog_sync_job(session_factory=MagicMock()) == {"card_count": 1, "printing_count": 1}
    again = app_db.try_advisory_lock(app_db.CATALOG_SYNC_LOCK_KEY, engine)
    assert again is not None
    again.release()
    engine.dispose()


@requires_postgres
def test_job_lock_ends_with_its_transaction_behind_a_pooler_647():
    engine = make_bare_engine()
    key = app_db.CATALOG_SYNC_LOCK_KEY
    held = app_db.try_advisory_lock(key, engine)
    assert held is not None
    second = None
    try:
        assert app_db.try_advisory_lock(key, engine) is None
        held._conn.rollback()
        second = app_db.try_advisory_lock(key, engine)
        assert second is not None
    finally:
        held.release()
        if second is not None:
            second.release()
        engine.dispose()
