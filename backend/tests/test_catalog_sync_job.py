from __future__ import annotations

import threading
from unittest.mock import MagicMock

import pytest

from app import catalog_sync


@pytest.fixture(autouse=True)
def _reset_sync_state():
    # Ensure a clean module-level guard/state around each test.
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
    assert calls == [fake_session]  # ran against the job's own session
    fake_session.close.assert_called_once()  # session always closed
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

    # Second attempt while the first holds the lock is a no-op.
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
    # Lock is released even on failure, so a later sync can run.
    assert not catalog_sync._sync_lock.locked()
