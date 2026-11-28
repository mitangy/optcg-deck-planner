from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from sqlalchemy import event, select

from app.admin import funnel as admin_funnel
from app.admin.models import ProductEvent
from app.admin.product_events import prune_old
from app.core import auth as core_auth
from app.core.auth import resolve_google_user
from app.core.models import User
from app.duel.models import DuelMatch, DuelMatchSeat, DuelSoloGame
from tests.test_admin import ADMIN_EMAIL, NOW, login, mk
from tests.test_admin import api  # noqa: F401  (fixture)
from tests.test_duel import client  # noqa: F401  (fixture)

ANON = "anon-visitor-0001"


def post(c, events, *, anon: str | None = ANON, app: str = "duel", **extra):
    body = {"app": app, "events": events, **extra}
    if anon is not None:
        body["anon_id"] = anon
    # A beacon sends text/plain so the browser skips the CORS preflight; the server reads the body itself.
    return c.post("/events", content=json.dumps(body), headers={"content-type": "text/plain;charset=UTF-8"})


def stored(S) -> list[ProductEvent]:
    with S() as db:
        return list(db.scalars(select(ProductEvent).order_by(ProductEvent.id)))


def test_unknown_event_names_are_dropped_and_props_keep_only_safe_keys_1499(api):
    c, S = api
    r = post(
        c,
        [
            {"name": "landing", "props": {"path": "/leaders/op01-001?utm=x&token=secret", "email": "a@b.c"}},
            {"name": "not_a_funnel_step"},
            {"name": "game_start", "props": {"mode": "bot", "leader": "OP01-001"}},
            "garbage",
        ],
        app="duel",
    )
    assert r.status_code == 204
    rows = stored(S)
    assert [e.name for e in rows] == ["landing", "game_start"]
    assert rows[0].props == {"path": "/leaders/op01-001"}
    assert rows[1].props == {"mode": "bot", "leader": "OP01-001"}
    assert rows[0].anon_id == ANON and rows[0].user_id is None and rows[0].device == "desktop"


def test_a_browser_cannot_send_signup_it_is_written_by_the_server_1499(api):
    c, S = api
    assert post(c, [{"name": "signup"}, {"name": "home_view"}]).status_code == 204
    assert [e.name for e in stored(S)] == ["home_view"]


def test_a_batch_stores_at_most_twenty_events_1499(api):
    c, S = api
    assert post(c, [{"name": "game_done"}] * 25).status_code == 204
    assert len(stored(S)) == 20


def test_an_oversized_body_is_refused_and_nothing_is_stored_1499(api):
    c, S = api
    assert post(c, [{"name": "home_view", "props": {"path": "x" * 40_000}}]).status_code == 413
    assert stored(S) == []


def test_events_attach_to_the_signed_in_user_and_need_some_identity_1499(api):
    c, S = api
    uid = mk(S, "p@x.test")
    assert post(c, [{"name": "home_view"}], anon=None).status_code == 204
    assert stored(S) == []
    login(c, S, uid)
    assert post(c, [{"name": "home_view"}], anon=None).status_code == 204
    [row] = stored(S)
    assert row.user_id == uid and row.anon_id is None


def test_landing_and_home_view_are_kept_once_a_day_per_visitor_but_game_events_are_not_1499(api):
    c, S = api
    assert post(c, [{"name": "home_view"}, {"name": "home_view"}, {"name": "game_done"}]).status_code == 204
    assert post(c, [{"name": "home_view"}, {"name": "game_done"}]).status_code == 204
    assert post(c, [{"name": "home_view"}], anon="anon-visitor-0002").status_code == 204
    assert [(e.name, e.anon_id) for e in stored(S)] == [
        ("home_view", ANON), ("game_done", ANON), ("game_done", ANON), ("home_view", "anon-visitor-0002"),
    ]


def test_one_browser_id_is_limited_even_from_many_addresses_1499(api, monkeypatch):
    c, S = api
    codes = [post(c, [{"name": "game_done"}]).status_code for _ in range(12)]
    assert codes[:10] == [204] * 10 and codes[10:] == [429, 429]
    assert post(c, [{"name": "game_done"}], anon="anon-visitor-0002").status_code == 204


def _count_user_updates(S):
    updates: list[str] = []
    engine = S.kw["bind"]

    def count(conn, cursor, statement, params, context, executemany):
        if statement.lstrip().upper().startswith("UPDATE USERS"):
            updates.append(statement)

    event.listen(engine, "before_cursor_execute", count)
    return updates, lambda: event.remove(engine, "before_cursor_execute", count)


def test_last_seen_is_stamped_once_a_day_on_authenticated_requests_and_events_1499(api, monkeypatch):
    c, S = api
    uid = mk(S, "p@x.test")
    login(c, S, uid)
    updates, stop = _count_user_updates(S)
    clock = [datetime(2026, 11, 20, 9, tzinfo=timezone.utc)]
    monkeypatch.setattr(core_auth, "utcnow", lambda: clock[0])

    for _ in range(3):
        assert c.get("/auth/me").status_code == 200
    assert len(updates) == 1
    with S() as db:
        assert db.get(User, uid).last_seen_at.replace(tzinfo=timezone.utc) == clock[0]

    clock[0] = datetime(2026, 11, 21, 0, 5, tzinfo=timezone.utc)
    assert post(c, [{"name": "game_done"}], anon=None).status_code == 204
    assert c.get("/auth/me").status_code == 200
    assert len(updates) == 2
    with S() as db:
        assert db.get(User, uid).last_seen_at.replace(tzinfo=timezone.utc) == clock[0]
    stop()


def test_last_seen_is_also_stamped_by_the_required_login_dependency_1499(api, monkeypatch):
    c, S = api
    uid = mk(S, "p@x.test")
    login(c, S, uid)
    monkeypatch.setattr(core_auth, "utcnow", lambda: datetime(2026, 11, 20, 9, tzinfo=timezone.utc))
    assert c.get("/decks").status_code == 200
    with S() as db:
        assert db.get(User, uid).last_seen_at is not None


def test_creating_an_account_records_one_signup_event_1499(db):
    user = resolve_google_user(db, email="new@x.test", sub="g-new", name="New", app="duel")
    resolve_google_user(db, email="new@x.test", sub="g-new", name="New", app="duel")
    rows = list(db.scalars(select(ProductEvent)))
    assert [(e.name, e.user_id, e.app) for e in rows] == [("signup", user.id, "duel")]


def test_events_older_than_180_days_are_deleted_and_newer_ones_kept_1499(api):
    _, S = api
    now = datetime(2026, 11, 28, tzinfo=timezone.utc)
    for name, age in (("old", 181), ("edge", 179)):
        _ev(S, name, now - timedelta(days=age), anon="anon-aaaaaaaa")
    with S() as db:
        assert prune_old(db, now) == 1
        assert [e.name for e in db.scalars(select(ProductEvent))] == ["edge"]


def _ev(S, name: str, at: datetime, *, anon: str | None = None, user_id: int | None = None) -> None:
    with S() as db:
        db.add(ProductEvent(name=name, app="duel", anon_id=anon, user_id=user_id, created_at=at))
        db.commit()


def test_funnel_counts_one_visitor_across_sign_in_and_leaves_out_staff_1499(api):
    c, S = api
    admin, mod = mk(S, ADMIN_EMAIL, "admin"), mk(S, "mod@x.test", "moderator")
    player = mk(S, "p@x.test")
    for who in ("anon-aaaaaaaa", "anon-aaaaaaaa", "anon-bbbbbbbb"):
        _ev(S, "landing", NOW - timedelta(days=1), anon=who)
    _ev(S, "landing", NOW - timedelta(days=40), anon="anon-cccccccc")
    # The same person before and after signing in is one visitor; staff testing the funnel are none.
    _ev(S, "landing", NOW - timedelta(days=1), anon="anon-dddddddd")
    _ev(S, "game_start", NOW - timedelta(days=1), anon="anon-dddddddd", user_id=player)
    _ev(S, "landing", NOW - timedelta(days=1), user_id=player)
    _ev(S, "game_start", NOW - timedelta(days=2), user_id=player)
    _ev(S, "landing", NOW - timedelta(days=1), anon="anon-eeeeeeee", user_id=admin)
    _ev(S, "landing", NOW - timedelta(days=1), user_id=mod)
    login(c, S, mod)
    assert c.get("/admin/funnel").status_code == 403
    login(c, S, admin)
    data = c.get("/admin/funnel?days=30").json()
    by = {s["step"]: s for s in data["steps"]}
    assert [s["step"] for s in data["steps"]] == ["landing", "home_view", "game_start", "game_done", "signup"]
    assert (by["landing"]["visitors"], by["landing"]["events"]) == (3, 5)
    assert (by["game_start"]["visitors"], by["game_start"]["events"]) == (1, 2)
    assert by["game_done"] == {"step": "game_done", "visitors": 0, "events": 0}


def test_retention_counts_a_return_only_24_hours_per_day_after_signup_1499(api):
    _, S = api
    now = datetime(2026, 11, 25, 15, tzinfo=timezone.utc)  # a Wednesday
    monday = datetime(2026, 11, 23, 12, tzinfo=timezone.utc)
    prev = monday - timedelta(days=7)
    seen_later = mk(S, "seen@x.test", created_at=prev, last_seen_at=prev + timedelta(days=3))
    # Seen 23 hours after signup is not a day-1 return even though the calendar day changed.
    too_soon = mk(S, "soon@x.test", created_at=prev, last_seen_at=prev + timedelta(hours=23))
    played_only = mk(S, "played@x.test", created_at=prev)
    bot_only = mk(S, "bot@x.test", created_at=prev)
    mk(S, "never@x.test", created_at=prev)
    mk(S, "guest@localhost", created_at=prev)
    mk(S, "staff@x.test", "moderator", created_at=prev, last_seen_at=now)
    mk(S, "fresh@x.test", created_at=monday, last_seen_at=now)
    with S() as db:
        db.add(
            DuelMatch(
                match_id="m1", seat0_user_id=played_only, seat1_user_id=played_only, winner_seat=0, turns=5,
                seat0_rating_before=1000, seat1_rating_before=1000, seat0_rating_after=1000,
                seat1_rating_after=1000, created_at=prev + timedelta(days=7),
            )
        )
        db.flush()
        db.add(
            DuelMatchSeat(match_id="m1", seat=0, user_id=played_only, leader_id="OP01-001", won=True, ranked=True,
                          turns=5, created_at=prev + timedelta(days=7))
        )
        db.add(DuelSoloGame(game_id="g1", user_id=bot_only, mode="bot", created_at=prev + timedelta(days=1)))
        db.commit()
        cohorts = {c["week_start"]: c for c in admin_funnel.build_retention(db, now, weeks=2)}
    last, this = cohorts[prev.date().isoformat()], cohorts[monday.date().isoformat()]
    assert (last["size"], last["d1_eligible"], last["d1_returned"]) == (5, 5, 3)
    assert (last["d7_eligible"], last["d7_returned"]) == (5, 1)
    # Created Monday noon: its day-1 point is Tuesday noon, already passed; day 7 is not.
    assert (this["size"], this["d1_eligible"], this["d1_returned"], this["d7_eligible"]) == (1, 1, 1, 0)
    assert seen_later and too_soon
