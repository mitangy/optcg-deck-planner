from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from app import db as app_db
from app.main import app

BACKEND_DIR = Path(__file__).resolve().parents[1]


def test_running_the_app_lifespan_in_tests_does_not_create_backend_optcg_db_refactor_0_7():
    # The lifespan runs init_db on the module-level engine; it must be the temp DB from conftest,
    # not the default sqlite:///./optcg.db that used to be written (and reused) between runs.
    with TestClient(app):
        pass
    assert Path(app_db.engine.url.database).resolve().parent != BACKEND_DIR
    assert not (BACKEND_DIR / "optcg.db").exists()
    assert not Path("optcg.db").exists()
