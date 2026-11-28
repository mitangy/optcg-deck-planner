from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import event, select

from app.admin import funnel as admin_funnel
from app.admin.models import ProductEvent
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


def test_a_batch_stores_at_most_twenty_events_1499(api):
    c, S = api
    assert post(c, [{"name": "home_view"}] * 25).status_code == 204
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


def test_a_game_token_attaches_events_without_a_cookie_1499(api):
    c, S = api
    token = c.post("/duel/guest-token", json={"guest_id": "guest-token-0001"}).json()["token"]
    r = c.post(
        "/events",
        content=json.dumps({"app": "duel", "events": [{"name": "game_done", "props": {"mode": "ranked"}}]}),
        headers={"content-type": "text/plain", "authorization": f"Bearer {token}"},
    )
    assert r.status_code == 204
    [row] = stored(S)
    assert row.user_id is not None and row.name == "game_done"


def test_last_seen_is_stamped_once_a_day_not_on_every_request_1499(api, monkeypatch):
    c, S = api
    uid = mk(S, "p@x.test")
    login(c, S, uid)
    updates: list[str] = []
    engine = S.kw["bind"]

    def count(conn, cursor, statement, params, context, executemany):
        if statement.lstrip().upper().startswith("UPDATE USERS"):
            updates.append(statement)

    event.listen(engine, "before_cursor_execute", count)
    day = [datetime(2026, 11, 20, 9, tzinfo=timezone.utc)]
    monkeypatch.setattr(core_auth, "utcnow", lambda: day[0])

    for _ in range(3):
        assert c.get("/auth/me").status_code == 200
    assert len(updates) == 1
    with S() as db:
        assert db.get(User, uid).last_seen_at == date(2026, 11, 20)

    day[0] = datetime(2026, 11, 21, 0, 5, tzinfo=timezone.utc)
    assert post(c, [{"name": "home_view"}], anon=None).status_code == 204
    assert c.get("/auth/me").status_code == 200
    assert len(updates) == 2
    with S() as db:
        assert db.get(User, uid).last_seen_at == date(2026, 11, 21)
    event.remove(engine, "before_cursor_execute", count)


def test_creating_an_account_records_one_signup_event_1499(db):
    user = resolve_google_user(db, email="new@x.test", sub="g-new", name="New", app="duel")
    resolve_google_user(db, email="new@x.test", sub="g-new", name="New", app="duel")
    rows = list(db.scalars(select(ProductEvent)))
    assert [(e.name, e.user_id, e.app) for e in rows] == [("signup", user.id, "duel")]


def _ev(S, name: str, at: datetime, *, anon: str | None = None, user_id: int | None = None) -> None:
    with S() as db:
        db.add(ProductEvent(name=name, app="duel", anon_id=anon, user_id=user_id, created_at=at))
        db.commit()


def test_funnel_counts_distinct_visitors_inside_the_range_per_step_1499(api):
    c, S = api
    admin, mod = mk(S, ADMIN_EMAIL, "admin"), mk(S, "mod@x.test", "moderator")
    player = mk(S, "p@x.test")
    for who in ("anon-aaaaaaaa", "anon-aaaaaaaa", "anon-bbbbbbbb"):
        _ev(S, "landing", NOW - timedelta(days=1), anon=who)
    _ev(S, "landing", NOW - timedelta(days=40), anon="anon-cccccccc")
    _ev(S, "home_view", NOW - timedelta(days=1), anon="anon-aaaaaaaa")
    _ev(S, "game_start", NOW - timedelta(days=1), user_id=player)
    _ev(S, "game_start", NOW - timedelta(days=2), user_id=player)
    login(c, S, mod)
    assert c.get("/admin/funnel").status_code == 403
    login(c, S, admin)
    data = c.get("/admin/funnel?days=30").json()
    by = {s["step"]: s for s in data["steps"]}
    assert [s["step"] for s in data["steps"]] == ["landing", "home_view", "game_start", "game_done", "signup"]
    assert (by["landing"]["visitors"], by["landing"]["events"]) == (2, 3)
    assert (by["home_view"]["visitors"], by["game_start"]["visitors"], by["game_start"]["events"]) == (1, 1, 2)
    assert by["game_done"] == {"step": "game_done", "visitors": 0, "events": 0}


def test_retention_counts_a_return_from_last_seen_or_from_match_history_1499(api):
    _, S = api
    today = date(2026, 11, 25)  # a Wednesday
    monday = date(2026, 11, 23)
    prev_monday = monday - timedelta(days=7)

    def at(d: date) -> datetime:
        return datetime(d.year, d.month, d.day, 12, tzinfo=timezone.utc)

    # Cohort of last week: signed up on Monday 16th, so day 1 and day 7 have both passed.
    seen_later = mk(S, "seen@x.test", created_at=at(prev_monday), last_seen_at=prev_monday + timedelta(days=3))
    played_only = mk(S, "played@x.test", created_at=at(prev_monday))
    bot_only = mk(S, "bot@x.test", created_at=at(prev_monday))
    never = mk(S, "never@x.test", created_at=at(prev_monday))
    mk(S, "guest@localhost", created_at=at(prev_monday))
    # This week's cohort: day 7 has not arrived yet, so it is not in that rate's denominator.
    mk(S, "fresh@x.test", created_at=at(monday), last_seen_at=today)
    with S() as db:
        db.add(
            DuelMatch(
                match_id="m1", seat0_user_id=played_only, seat1_user_id=played_only, winner_seat=0, turns=5,
                seat0_rating_before=1000, seat1_rating_before=1000, seat0_rating_after=1000,
                seat1_rating_after=1000, created_at=at(prev_monday + timedelta(days=7)),
            )
        )
        db.flush()
        db.add(
            DuelMatchSeat(match_id="m1", seat=0, user_id=played_only, leader_id="OP01-001", won=True, ranked=True,
                          turns=5, created_at=at(prev_monday + timedelta(days=7)))
        )
        db.add(DuelSoloGame(game_id="g1", user_id=bot_only, mode="bot", created_at=at(prev_monday + timedelta(days=1))))
        db.commit()
        cohorts = {c["week_start"]: c for c in admin_funnel.build_retention(db, today, weeks=2)}
    last, this = cohorts[prev_monday.isoformat()], cohorts[monday.isoformat()]
    assert (last["size"], last["d1_eligible"], last["d1_returned"]) == (4, 4, 3)
    assert (last["d7_eligible"], last["d7_returned"]) == (4, 1)
    assert (this["size"], this["d1_eligible"], this["d1_returned"], this["d7_eligible"]) == (1, 1, 1, 0)
    assert never and seen_later
