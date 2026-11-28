from __future__ import annotations

from datetime import timedelta

import pytest
from sqlalchemy import select

from app.admin.client_errors import clean_message, fingerprint
from app.admin.models import ClientError
from app.core.db import get_session_factory
from app.core.time import utcnow
from tests.test_admin import ADMIN_EMAIL, api, login, mk  # noqa: F401  (fixtures)
from tests.test_duel import client  # noqa: F401  (fixture)

STACK = "TypeError: x is undefined\n    at render (https://optcgduel.app/assets/index-AbC123xY.js:10:20)\n    at run (https://optcgduel.app/assets/index-AbC123xY.js:30:5)"
BODY = {"app": "duel", "message": "TypeError: x is undefined", "stack": STACK, "url": "/duel", "release": "abc1234"}


def _rows(S) -> list[ClientError]:
    with S() as db:
        return list(db.scalars(select(ClientError).order_by(ClientError.id)))


def test_same_error_within_an_hour_raises_the_count_instead_of_adding_a_row_1500(api):
    c, S = api
    assert c.post("/client-errors", json=BODY).status_code == 204
    assert c.post("/client-errors", json=BODY).status_code == 204
    rows = _rows(S)
    assert len(rows) == 1
    assert rows[0].count == 2


def test_the_same_error_an_hour_later_starts_a_new_row_1500(api):
    c, S = api
    c.post("/client-errors", json=BODY)
    with S() as db:
        row = db.scalars(select(ClientError)).one()
        row.last_seen_at = utcnow() - timedelta(hours=1, minutes=5)
        db.commit()
    c.post("/client-errors", json=BODY)
    assert [r.count for r in _rows(S)] == [1, 1]


def test_a_different_error_gets_its_own_row_1500(api):
    c, S = api
    c.post("/client-errors", json=BODY)
    c.post("/client-errors", json={**BODY, "message": "RangeError: out of bounds"})
    assert len(_rows(S)) == 2


def test_fingerprint_ignores_ids_and_line_positions_but_not_the_app_or_message_1500():
    a = fingerprint("duel", "Room 4821 not found", "at f (https://x/assets/index-AAAAAA11.js:1:2)")
    b = fingerprint("duel", "Room 77 not found", "at f (https://x/assets/index-BBBBBB22.js:90:7)")
    assert a == b
    assert a != fingerprint("planner", "Room 77 not found", "at f (https://x/assets/index-BBBBBB22.js:90:7)")
    assert a != fingerprint("duel", "Deck 77 not found", "at f (https://x/assets/index-BBBBBB22.js:90:7)")
    assert a != fingerprint("duel", "Room 77 not found", "at g (https://x/assets/index-BBBBBB22.js:90:7)")


def test_a_database_error_message_loses_its_statement_and_bound_values_1500():
    raw = "IntegrityError: duplicate key\n[SQL: INSERT INTO users (email) VALUES (?)]\n[parameters: ('a@b.c',)]"
    assert clean_message(raw) == "IntegrityError: duplicate key"


def test_long_text_is_cut_and_the_url_keeps_only_its_path_1500(api):
    c, S = api
    r = c.post(
        "/client-errors",
        json={**BODY, "message": "m" * 3000, "stack": "s" * 15000, "url": "https://optcgduel.app/duel/abc?token=secret#frag"},
    )
    assert r.status_code == 204
    row = _rows(S)[0]
    assert len(row.message) == 500
    assert len(row.stack) == 4000
    assert row.url == "/duel/abc"


def test_the_reporter_is_recorded_when_signed_in_and_the_report_works_anonymously_1500(api):
    c, S = api
    uid = mk(S, "p@x.test")
    c.post("/client-errors", json=BODY)
    assert _rows(S)[0].user_id is None
    c.post("/client-errors", json={**BODY, "message": "Other failure"})
    login(c, S, uid)
    c.post("/client-errors", json={**BODY, "message": "Other failure"})
    assert [r.user_id for r in _rows(S)] == [None, uid]


def test_one_address_cannot_flood_the_table_1500(api):
    c, S = api
    codes = [c.post("/client-errors", json={**BODY, "message": f"error {'x' * i}"}).status_code for i in range(31)]
    assert codes[:30] == [204] * 30
    assert codes[30] == 429


def test_only_the_apps_may_report_as_duel_or_planner_1500(api):
    c, S = api
    assert c.post("/client-errors", json={**BODY, "app": "api"}).status_code == 422


def test_an_unhandled_server_exception_is_recorded_as_api_without_the_request_body_1500(api, monkeypatch):
    c, S = api
    from app.main import app

    def boom():
        raise RuntimeError("kaboom for 42")

    app.add_api_route("/__boom", boom, methods=["POST"])
    app.dependency_overrides[get_session_factory] = lambda: S
    try:
        # TestClient re-raises once the handler has run (as the server logs it); the row is what matters.
        with pytest.raises(RuntimeError):
            c.post("/__boom?token=hunter2", json={"password": "hunter2"}, headers={"Authorization": "Bearer hunter2"})
    finally:
        app.router.routes.pop()
    rows = _rows(S)
    assert len(rows) == 1
    assert rows[0].app == "api"
    assert "kaboom for 42" in rows[0].message
    assert rows[0].url == "/__boom"
    assert "hunter2" not in rows[0].message + rows[0].stack + rows[0].url


def test_the_admin_list_groups_repeats_and_is_admin_only_1500(api):
    c, S = api
    admin, plain = mk(S, ADMIN_EMAIL, "admin"), mk(S, "p@x.test")
    for _ in range(3):
        c.post("/client-errors", json=BODY)
    c.post("/client-errors", json={**BODY, "app": "planner", "message": "Other failure"})
    login(c, S, plain)
    assert c.get("/admin/client-errors").status_code == 403
    login(c, S, admin)
    out = c.get("/admin/client-errors").json()
    assert out["total"] == 4
    assert [(g["app"], g["count"]) for g in out["groups"]] == [("planner", 1), ("duel", 3)]
