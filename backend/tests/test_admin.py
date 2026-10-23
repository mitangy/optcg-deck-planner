"""Admin page API, roles and bans (#667)."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from authlib.integrations.httpx_client import AsyncOAuth2Client
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from app import admin_hosting
from app import db as app_db
from app.auth import (
    OAUTH_NONCE_COOKIE,
    SESSION_COOKIE,
    create_login_ticket,
    create_oauth_state,
    create_session_token,
    new_oauth_nonce,
)
from app.config import Settings, get_settings
from app.models import (
    AnalystEvalRun,
    AnalystToken,
    BotMatch,
    Deck,
    DuelMatch,
    DuelMatchSeat,
    DuelRating,
    User,
)
from app.roles import can_ban, can_delete, can_set_role
from tests.db_support import make_bare_engine
from tests.test_duel import client  # noqa: F401  (fixture)

ADMIN_EMAIL = "gamefreakmichaeltang@gmail.com"
SERVICE = {"X-Analyst-Service": "svc-secret"}
NOW = datetime.now(timezone.utc)


@pytest.fixture()
def api(client, monkeypatch: pytest.MonkeyPatch):  # noqa: F811
    monkeypatch.setenv("ANALYST_SERVICE_SECRET", "svc-secret")
    monkeypatch.setenv("ANALYST_PUBLIC_URL", "https://analyst.example/")
    # A developer's own tokens must never reach a test.
    for name in ("VERCEL_TOKEN", "VERCEL_TEAM_ID", "RENDER_API_KEY", "GITHUB_TOKEN", "GITHUB_REPO"):
        monkeypatch.delenv(name, raising=False)
    get_settings.cache_clear()
    admin_hosting.clear_cache()
    yield client
    admin_hosting.clear_cache()
    get_settings.cache_clear()


def mk(SessionLocal, email: str, role: str = "user", **kw) -> int:
    with SessionLocal() as db:
        u = User(email=email, name=kw.pop("name", email.split("@")[0]), google_sub=f"sub-{email}", role=role, **kw)
        db.add(u)
        db.commit()
        return u.id


def login(c, SessionLocal, uid: int) -> None:
    with SessionLocal() as db:
        sv = db.get(User, uid).session_version
    c.cookies.clear()
    c.cookies.set(SESSION_COOKIE, create_session_token(uid, sv, get_settings()))


def seat(db: Session, match_id: str, user_id: int, leader: str, won: bool, at: datetime, ranked: bool = True) -> None:
    # Its finished match first: Postgres enforces the seat's foreign key to duel_matches.
    db.add(
        DuelMatch(
            match_id=match_id, seat0_user_id=user_id, seat1_user_id=user_id, winner_seat=0 if won else 1,
            ranked=ranked, turns=6, seat0_rating_before=1000, seat1_rating_before=1000,
            seat0_rating_after=1000, seat1_rating_after=1000, created_at=at,
        )
    )
    db.flush()
    db.add(DuelMatchSeat(match_id=match_id, seat=0, user_id=user_id, leader_id=leader, won=won, ranked=ranked, turns=6, created_at=at))


def user_obj(id: int, role: str = "user", banned: bool = False):
    return User(id=id, email=f"u{id}@x.test", name="n", google_sub=f"s{id}", role=role, banned_at=NOW if banned else None)


# ------------------------------------------------------------------ pure rules

def test_moderators_ban_only_players_and_nobody_bans_the_admin_or_themselves_667():
    admin, mod, mod2, player = user_obj(1, "admin"), user_obj(2, "moderator"), user_obj(3, "moderator"), user_obj(4)
    assert can_ban(mod, player) is None
    assert can_ban(mod, mod2) is not None
    assert can_ban(mod, admin) is not None
    assert can_ban(admin, mod) is None
    assert can_ban(admin, admin) is not None
    assert can_ban(admin, user_obj(8, "admin")) is not None
    assert can_ban(mod, mod) is not None
    assert can_ban(player, user_obj(5)) is not None


def test_only_the_admin_sets_roles_never_admin_and_not_on_themselves_667():
    admin, mod, player = user_obj(1, "admin"), user_obj(2, "moderator"), user_obj(4)
    assert can_set_role(admin, player, "moderator") is None
    assert can_set_role(admin, mod, "user") is None
    assert can_set_role(admin, player, "admin") is not None
    assert can_set_role(admin, admin, "user") is not None
    assert can_set_role(mod, player, "moderator") is not None


def test_only_the_admin_deletes_accounts_and_not_their_own_667():
    admin, mod, player = user_obj(1, "admin"), user_obj(2, "moderator"), user_obj(4)
    assert can_delete(admin, player) is None
    assert can_delete(admin, mod) is None
    assert can_delete(admin, admin) is not None
    assert can_delete(admin, user_obj(8, "admin")) is not None
    assert can_delete(mod, player) is not None


# ------------------------------------------------------------------ access levels

def test_analytics_are_admin_only_and_the_user_list_is_staff_only_667(api):
    c, S = api
    admin, mod, plain = mk(S, ADMIN_EMAIL, "admin"), mk(S, "mod@x.test", "moderator"), mk(S, "p@x.test")
    assert c.get("/admin/users").status_code == 401
    login(c, S, plain)
    assert c.get("/admin/users").status_code == 403
    assert c.get("/admin/me").status_code == 403
    login(c, S, mod)
    assert c.get("/admin/users").status_code == 200
    assert c.get("/admin/me").json() == {"role": "moderator", "can": {"analytics": False, "set_roles": False, "ban": True, "delete": False}}
    for path in ("/admin/overview", "/admin/bots", "/admin/hosting"):
        assert c.get(path).status_code == 403, path
    login(c, S, admin)
    assert c.get("/admin/me").json()["can"] == {"analytics": True, "set_roles": True, "ban": True, "delete": True}
    for path in ("/admin/overview", "/admin/bots", "/admin/hosting"):
        assert c.get(path).status_code == 200, path


def test_moderators_cannot_change_roles_or_delete_accounts_667(api):
    c, S = api
    mod, plain = mk(S, "mod@x.test", "moderator"), mk(S, "p@x.test")
    login(c, S, mod)
    assert c.put(f"/admin/users/{plain}/role", json={"role": "moderator"}).status_code == 403
    assert c.delete(f"/admin/users/{plain}").status_code == 403
    with S() as db:
        assert db.get(User, plain).role == "user"


def test_auth_me_carries_the_role_667(api):
    c, S = api
    login(c, S, mk(S, "mod@x.test", "moderator"))
    assert c.get("/auth/me").json()["role"] == "moderator"


def test_the_admin_role_counts_as_chat_owner_and_model_admin_667():
    from app.routers.analyst import is_chat_owner, is_model_admin

    settings = Settings(analyst_chat_emails="", analyst_model_admin_emails="")
    assert is_chat_owner(settings, user_obj(1, "admin")) and is_model_admin(settings, user_obj(1, "admin"))
    assert not is_chat_owner(settings, user_obj(2, "moderator")) and not is_model_admin(settings, user_obj(2, "moderator"))


# ------------------------------------------------------------------ roles

def test_admin_sets_moderator_and_user_but_never_admin_or_own_role_667(api):
    c, S = api
    admin, plain = mk(S, ADMIN_EMAIL, "admin"), mk(S, "p@x.test")
    login(c, S, admin)
    r = c.put(f"/admin/users/{plain}/role", json={"role": "moderator"})
    assert r.status_code == 200 and r.json()["role"] == "moderator"
    assert c.put(f"/admin/users/{plain}/role", json={"role": "user"}).json()["role"] == "user"
    assert c.put(f"/admin/users/{plain}/role", json={"role": "admin"}).status_code == 400
    assert c.put(f"/admin/users/{plain}/role", json={"role": "wizard"}).status_code == 400
    assert c.put(f"/admin/users/{admin}/role", json={"role": "user"}).status_code == 403
    assert c.put("/admin/users/9999/role", json={"role": "user"}).status_code == 404
    with S() as db:
        assert db.get(User, plain).role == "user" and db.get(User, admin).role == "admin"


# ------------------------------------------------------------------ bans

def test_ban_signs_the_player_out_everywhere_and_records_who_and_why_667(api):
    c, S = api
    mod, plain = mk(S, "mod@x.test", "moderator"), mk(S, "p@x.test")
    login(c, S, plain)
    assert c.get("/auth/me").json()["id"] == plain
    login(c, S, mod)
    r = c.post(f"/admin/users/{plain}/ban", json={"reason": "cheating"})
    assert r.status_code == 200 and r.json()["ban_reason"] == "cheating" and r.json()["banned_at"]
    with S() as db:
        u = db.get(User, plain)
        assert (u.banned_by, u.session_version) == (mod, 1)
    # The cookie they held before the ban no longer works.
    c.cookies.clear()
    c.cookies.set(SESSION_COOKIE, create_session_token(plain, 0, get_settings()))
    assert c.get("/auth/me").json() is None
    # Unbanning does not revive it: the ban signed that session out for good.
    login(c, S, mod)
    assert c.post(f"/admin/users/{plain}/unban").status_code == 200
    c.cookies.clear()
    c.cookies.set(SESSION_COOKIE, create_session_token(plain, 0, get_settings()))
    assert c.get("/auth/me").json() is None
    assert c.post("/duel/token").status_code == 401


def test_banned_accounts_get_403_even_with_a_current_cookie_and_unban_restores_them_667(api):
    c, S = api
    admin, plain = mk(S, ADMIN_EMAIL, "admin"), mk(S, "p@x.test", banned_at=NOW, ban_reason="spam")
    login(c, S, plain)
    r = c.post("/duel/token")
    assert (r.status_code, r.json()) == (403, {"detail": "Account banned"})
    assert c.get("/auth/me").json() is None
    login(c, S, admin)
    assert c.post(f"/admin/users/{plain}/unban").json()["banned_at"] is None
    login(c, S, plain)
    assert c.get("/auth/me").json()["id"] == plain
    assert c.post("/duel/token").status_code == 200
    with S() as db:
        u = db.get(User, plain)
        assert (u.banned_at, u.ban_reason, u.banned_by) == (None, None, None)


def test_ban_rules_are_enforced_by_the_endpoint_667(api):
    c, S = api
    admin, mod, mod2, plain = mk(S, ADMIN_EMAIL, "admin"), mk(S, "m@x.test", "moderator"), mk(S, "m2@x.test", "moderator"), mk(S, "p@x.test")
    login(c, S, mod)
    assert c.post(f"/admin/users/{mod2}/ban").status_code == 403
    assert c.post(f"/admin/users/{admin}/ban").status_code == 403
    assert c.post(f"/admin/users/{mod}/ban").status_code == 403
    assert c.post("/admin/users/9999/ban").status_code == 404
    assert c.post(f"/admin/users/{plain}/ban").status_code == 200
    login(c, S, admin)
    assert c.post(f"/admin/users/{admin}/ban").status_code == 403
    assert c.post(f"/admin/users/{mod2}/ban", json={"reason": "x" * 201}).status_code == 422
    assert c.post(f"/admin/users/{mod2}/ban").status_code == 200
    login(c, S, mod)
    assert c.post(f"/admin/users/{mod2}/unban").status_code == 403
    assert c.post(f"/admin/users/{plain}/unban").status_code == 200


def test_a_banned_account_cannot_claim_a_login_ticket_667(api):
    c, S = api
    plain = mk(S, "p@x.test", banned_at=NOW)
    with S() as db:
        ticket = create_login_ticket(db, plain, get_settings())
    r = c.post("/auth/claim", json={"ticket": ticket})
    assert r.status_code == 403 and SESSION_COOKIE not in r.cookies


def test_a_banned_google_sign_in_is_sent_back_with_an_error_and_no_ticket_667(api, monkeypatch: pytest.MonkeyPatch):
    c, S = api
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "cid")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "secret")
    monkeypatch.setenv("ALLOW_ANY_GOOGLE_USER", "true")
    get_settings.cache_clear()
    mk(S, "banned@x.test", banned_at=NOW)
    mk(S, "fine@x.test")

    async def fake_fetch_token(self, url, **kwargs):
        return {"access_token": "t"}

    profile: dict = {}

    class _Resp:
        status_code = 200

        def json(self):
            return profile

    async def fake_get(self, url, **kwargs):
        return _Resp()

    monkeypatch.setattr(AsyncOAuth2Client, "fetch_token", fake_fetch_token)
    monkeypatch.setattr(AsyncOAuth2Client, "get", fake_get)

    def sign_in(email: str) -> str:
        profile.update({"email": email, "sub": f"sub-{email}", "name": "N", "email_verified": True})
        nonce = new_oauth_nonce()
        c.cookies.set(OAUTH_NONCE_COOKIE, nonce)
        state = create_oauth_state(nonce, get_settings())
        r = c.get(f"/auth/callback?state={state}&code=x", follow_redirects=False)
        assert r.status_code in (302, 307)
        return r.headers["location"]

    assert sign_in("banned@x.test").endswith("/login#error=banned")
    assert "#ticket=" in sign_in("fine@x.test")


def test_a_banned_guest_cannot_mint_a_duel_token_667(api):
    c, S = api
    gid = "abcdefabcdefabcdefabcdef"
    assert c.post("/duel/guest-token", json={"guest_id": gid}).status_code == 200
    with S() as db:
        u = db.query(User).filter(User.email == f"guest-{gid}@localhost").one()
        u.banned_at = NOW
        db.commit()
    assert c.post("/duel/guest-token", json={"guest_id": gid}).status_code == 403


# ------------------------------------------------------------------ delete

def test_deleting_a_user_removes_their_data_but_not_other_accounts_667(api):
    c, S = api
    admin, mod, victim, other = mk(S, ADMIN_EMAIL, "admin"), mk(S, "m@x.test", "moderator"), mk(S, "v@x.test"), mk(S, "o@x.test")
    with S() as db:
        for uid in (victim, other):
            db.add(Deck(user_id=uid, name="d"))
            db.add(DuelRating(user_id=uid))
            db.add(AnalystToken(user_id=uid, token_hash=f"h{uid}"))
        db.commit()
    login(c, S, admin)
    assert c.delete(f"/admin/users/{admin}").status_code == 403
    assert c.delete("/admin/users/9999").status_code == 404
    assert c.delete(f"/admin/users/{victim}").status_code == 204
    with S() as db:
        assert db.get(User, victim) is None
        assert [d.user_id for d in db.query(Deck)] == [other]
        assert [r.user_id for r in db.query(DuelRating)] == [other]
        assert [t.user_id for t in db.query(AnalystToken)] == [other]
        assert db.get(User, other) is not None
    assert c.delete(f"/admin/users/{mod}").status_code == 204


# ------------------------------------------------------------------ user list

def test_user_list_hides_guests_searches_and_puts_staff_first_667(api):
    c, S = api
    mod = mk(S, "mod@x.test", "moderator", name="Zed", created_at=NOW - timedelta(days=100))
    old = mk(S, "old@x.test", name="Old", created_at=NOW - timedelta(days=9))
    new = mk(S, "new@x.test", name="Newbie", username="Nami_Fan", created_at=NOW - timedelta(days=1))
    guest = mk(S, "guest-1@localhost", name="Guest 1")
    with S() as db:
        seat(db, "m1", old, "OP01-001", True, NOW - timedelta(days=2))
        seat(db, "m2", old, "OP01-001", False, NOW - timedelta(days=1))
        db.commit()
    login(c, S, mod)
    body = c.get("/admin/users").json()
    assert [u["id"] for u in body["users"]] == [mod, new, old] and body["total"] == 3
    old_row = body["users"][2]
    assert old_row["matches"] == 2 and old_row["last_match_at"]
    assert body["users"][1]["matches"] == 0 and body["users"][1]["last_match_at"] is None
    with_guests = c.get("/admin/users", params={"include_guests": 1}).json()
    assert with_guests["total"] == 4 and guest in [u["id"] for u in with_guests["users"]]
    assert [u["id"] for u in c.get("/admin/users", params={"q": "NAMI"}).json()["users"]] == [new]
    assert [u["id"] for u in c.get("/admin/users", params={"q": "old@X"}).json()["users"]] == [old]
    assert c.get("/admin/users", params={"q": "%"}).json()["total"] == 0
    page = c.get("/admin/users", params={"limit": 1, "offset": 1}).json()
    assert (page["total"], [u["id"] for u in page["users"]]) == (3, [new])


# ------------------------------------------------------------------ analytics

def test_overview_counts_real_players_guests_and_recent_signups_667(api):
    c, S = api
    admin = mk(S, ADMIN_EMAIL, "admin")
    mk(S, "a@x.test", created_at=NOW - timedelta(days=3))
    mk(S, "b@x.test", created_at=NOW - timedelta(days=20))
    mk(S, "c@x.test", created_at=NOW - timedelta(days=60), banned_at=NOW)
    mk(S, "g1@localhost", created_at=NOW - timedelta(days=1))
    mk(S, "mod@x.test", "moderator", created_at=NOW - timedelta(days=60))
    login(c, S, admin)
    data = c.get("/admin/overview").json()
    assert data["accounts"] == {"total": 6, "real": 5, "guests": 1, "staff": 2, "banned": 1, "new_7d": 3, "new_30d": 4}


def test_overview_signups_and_matches_are_bucketed_per_day_and_zero_filled_667(api):
    c, S = api
    admin = mk(S, ADMIN_EMAIL, "admin", created_at=NOW - timedelta(days=45))
    a = mk(S, "a@x.test", created_at=NOW - timedelta(days=2))
    mk(S, "b@x.test", created_at=NOW - timedelta(days=2))
    mk(S, "g@localhost", created_at=NOW - timedelta(days=2))
    with S() as db:
        for i, (days, ranked) in enumerate([(0, True), (0, False), (1, True), (40, True)]):
            db.add(
                DuelMatch(
                    match_id=f"m{i}", seat0_user_id=a, seat1_user_id=admin, winner_seat=0, ranked=ranked, turns=8,
                    seat0_rating_before=1000, seat1_rating_before=1000, seat0_rating_after=1010, seat1_rating_after=990,
                    created_at=NOW - timedelta(days=days),
                )
            )
        db.commit()
    login(c, S, admin)
    data = c.get("/admin/overview").json()
    signups, matches = data["signups_by_day"], data["matches_by_day"]
    assert len(signups) == 30 and len(matches) == 30
    assert signups[-1]["day"] == NOW.date().isoformat()
    day = {s["day"]: s for s in signups}[(NOW - timedelta(days=2)).date().isoformat()]
    assert (day["real"], day["guests"]) == (2, 1)
    assert sum(s["real"] + s["guests"] for s in signups) == 3  # the 45-day-old admin is outside the window
    assert (matches[-1]["ranked"], matches[-1]["casual"]) == (1, 1)
    assert (matches[-2]["ranked"], matches[-2]["casual"]) == (1, 0)
    assert sum(m["ranked"] + m["casual"] for m in matches) == 3  # the 40-day-old match is outside it
    assert data["matches"] == {"total": 4, "last_7d": 3, "ranked_7d": 2, "avg_turns_30d": 8.0}


def test_overview_active_players_and_top_leaders_use_their_windows_667(api):
    c, S = api
    admin = mk(S, ADMIN_EMAIL, "admin")
    p1, p2, p3, guest, p4 = mk(S, "1@x.test"), mk(S, "2@x.test"), mk(S, "3@x.test"), mk(S, "g@localhost"), mk(S, "4@x.test")
    with S() as db:
        # p4 only shows up in a finished match, not in the seat table.
        db.add(
            DuelMatch(
                match_id="only-match", seat0_user_id=p4, seat1_user_id=p1, winner_seat=0, turns=5,
                seat0_rating_before=1000, seat1_rating_before=1000, seat0_rating_after=1010, seat1_rating_after=990,
                created_at=NOW - timedelta(hours=3),
            )
        )
        seat(db, "a", p1, "OP01-001", True, NOW - timedelta(hours=2))
        seat(db, "b", p2, "OP01-001", False, NOW - timedelta(days=3))
        seat(db, "c", p3, "OP05-060", True, NOW - timedelta(days=20))
        seat(db, "d", guest, "OP05-060", True, NOW - timedelta(days=3))
        seat(db, "e", p3, "OP09-001", True, NOW - timedelta(days=50))
        db.commit()
    login(c, S, admin)
    data = c.get("/admin/overview").json()
    assert data["active"] == {"d1": 2, "d7": 4, "d30": 5, "real_d7": 3, "real_d30": 4}
    assert data["top_leaders_30d"] == [
        {"leader_id": "OP01-001", "games": 2, "wins": 1},
        {"leader_id": "OP05-060", "games": 2, "wins": 2},
    ]


def test_overview_counts_planner_decks_and_log_pose_use_667(api):
    from app.models import AnalystAccess, AnalystUsage

    c, S = api
    admin, p = mk(S, ADMIN_EMAIL, "admin"), mk(S, "p@x.test")
    with S() as db:
        db.add_all([Deck(user_id=p, name="a"), Deck(user_id=p, name="b"), Deck(user_id=admin, name="c")])
        db.add_all([AnalystAccess(user_id=p, status="approved"), AnalystAccess(user_id=admin, status="pending")])
        db.add_all(
            [
                AnalystUsage(user_id=p, kind="chat", cost_usd=0.25, created_at=NOW),
                AnalystUsage(user_id=p, kind="review", cost_usd=0.5, created_at=NOW),
                AnalystUsage(user_id=p, kind="chat", cost_usd=9.0, created_at=NOW - timedelta(days=70)),
            ]
        )
        db.commit()
    login(c, S, admin)
    data = c.get("/admin/overview").json()
    assert data["planner"] == {"decks": 3, "users_with_decks": 2}
    assert data["log_pose"] == {"questions_month": 1, "spend_month_usd": 0.75, "users_with_access": 1}


# ------------------------------------------------------------------ bots and evals

def _bot(db: Session, i: int, at: datetime, winner: int | None, first: int | None, turns: int | None, a="OP01-001", b="OP05-060", batch="n1") -> None:
    db.add(
        BotMatch(
            game_id=f"b_{i}", batch_id=batch, batch_index=i, created_at=at, leader_a=a, leader_b=b,
            winner=winner, turns=turns, first_seat=first, replay="{}",
        )
    )


def test_bots_summary_counts_games_matchups_and_first_seat_wins_667(api):
    c, S = api
    admin = mk(S, ADMIN_EMAIL, "admin")
    with S() as db:
        _bot(db, 0, NOW - timedelta(days=2), 0, 0, 10)
        _bot(db, 1, NOW - timedelta(days=2), 1, 0, 20)
        _bot(db, 2, NOW - timedelta(days=1), 0, 0, 6, a="OP05-060", b="OP01-001")
        _bot(db, 3, NOW - timedelta(days=1), None, None, None, a="OP09-001", b="OP01-001", batch="n2")
        _bot(db, 4, NOW - timedelta(days=30), 0, 0, 4)
        db.commit()
    login(c, S, admin)
    bots = c.get("/admin/bots").json()["bot_games"]
    assert (bots["total"], bots["finished"], bots["unfinished"]) == (5, 4, 1)
    assert (bots["leaders"], bots["matchups"]) == (3, 2)
    assert bots["avg_turns"] == 10.0
    assert bots["first_seat_win_rate"] == 0.75
    assert bots["last_batch_id"] == "n2"
    assert bots["first_game_at"] < bots["last_game_at"]
    by_day = bots["by_day"]
    assert len(by_day) == 14 and by_day[-1]["day"] == NOW.date().isoformat()
    day = {d["day"]: d for d in by_day}[(NOW - timedelta(days=1)).date().isoformat()]
    assert (day["games"], day["finished"]) == (2, 1)
    assert sum(d["games"] for d in by_day) == 4  # the 30-day-old game is outside the 14 days


def test_bots_with_no_games_report_nulls_not_errors_667(api):
    c, S = api
    login(c, S, mk(S, ADMIN_EMAIL, "admin"))
    bots = c.get("/admin/bots").json()["bot_games"]
    assert (bots["total"], bots["first_game_at"], bots["avg_turns"], bots["first_seat_win_rate"]) == (0, None, None, None)


def test_the_two_historic_eval_runs_are_seeded_once_oldest_first_667(api):
    c, S = api
    login(c, S, mk(S, ADMIN_EMAIL, "admin"))
    bind = S.kw["bind"]
    app_db._seed_eval_runs(bind)
    app_db._seed_eval_runs(bind)  # a restart must not add them again
    evals = c.get("/admin/bots").json()["evals"]
    assert [(e["label"], e["correct"], e["total"]) for e in evals] == [("Baseline", 43.5, 50), ("PR #415 prompt + grader", 48.5, 50)]
    assert evals[1]["groups"]["D"] == {"correct": 9, "total": 10}
    assert evals[0]["run_at"].startswith("2026-10-08T00:45") and evals[0]["spend_usd"] == 5.97
    with S() as db:
        assert db.query(AnalystEvalRun).count() == 2


def test_eval_upload_needs_the_service_secret_and_lands_in_the_history_667(api):
    c, S = api
    body = {"label": "nightly", "model": "claude-opus-5-5", "correct": 47.5, "total": 50, "groups": {"D": {"correct": 8.5, "total": 10}}, "spend_usd": 6.1}
    assert c.post("/admin/evals", json=body).status_code == 403
    assert c.post("/admin/evals", json=body, headers={"X-Analyst-Service": "nope"}).status_code == 403
    assert c.post("/admin/evals", json={**body, "correct": 51}, headers=SERVICE).status_code == 422
    r = c.post("/admin/evals", json=body, headers=SERVICE)
    assert r.status_code == 201 and r.json()["label"] == "nightly"
    # The login cookie of a plain admin is not the service secret.
    login(c, S, mk(S, ADMIN_EMAIL, "admin"))
    assert c.post("/admin/evals", json=body).status_code == 403
    evals = c.get("/admin/bots").json()["evals"]
    assert evals[-1]["label"] == "nightly" and evals[-1]["groups"] == {"D": {"correct": 8.5, "total": 10}}


# ------------------------------------------------------------------ hosting

def _mock(monkeypatch: pytest.MonkeyPatch, handler) -> list[httpx.Request]:
    seen: list[httpx.Request] = []

    def wrapped(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return handler(request)

    monkeypatch.setattr(admin_hosting, "_transport", httpx.MockTransport(wrapped))
    return seen


def _hosting_env(monkeypatch: pytest.MonkeyPatch, **env: str) -> None:
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    get_settings.cache_clear()


def test_hosting_without_tokens_is_not_configured_and_makes_no_calls_667(api, monkeypatch):
    c, S = api
    seen = _mock(monkeypatch, lambda r: httpx.Response(500))
    login(c, S, mk(S, ADMIN_EMAIL, "admin"))
    assert c.get("/admin/hosting").json() == {"vercel": {"configured": False}, "render": {"configured": False}, "github": {"configured": False}}
    assert seen == []


def _vercel_handler(request: httpx.Request) -> httpx.Response:
    if request.url.path == "/v9/projects":
        assert request.url.params["teamId"] == "team_1"
        return httpx.Response(200, json={"projects": [{"id": "prj_1", "name": "duel-web", "framework": "vite"}]})
    assert request.url.path == "/v6/deployments" and request.url.params["projectId"] == "prj_1"
    week = 7 * 24 * 3600 * 1000
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    return httpx.Response(
        200,
        json={"deployments": [
            {"state": "READY", "created": now_ms - 1000, "url": "duel.vercel.app", "meta": {"githubCommitMessage": "Fix bug"}},
            {"state": "READY", "created": now_ms - 3 * 24 * 3600 * 1000},
            {"state": "ERROR", "created": now_ms - week - 5000},
        ]},
    )


def test_hosting_reads_vercel_and_never_returns_the_token_667(api, monkeypatch):
    c, S = api
    _hosting_env(monkeypatch, VERCEL_TOKEN="vtok-secret", VERCEL_TEAM_ID="team_1")
    seen = _mock(monkeypatch, _vercel_handler)
    login(c, S, mk(S, ADMIN_EMAIL, "admin"))
    r = c.get("/admin/hosting")
    v = r.json()["vercel"]
    assert v["configured"] is True
    proj = v["projects"][0]
    assert (proj["name"], proj["framework"], proj["deploys_7d"]) == ("duel-web", "vite", 2)
    assert (proj["latest"]["state"], proj["latest"]["url"], proj["latest"]["commit"]) == ("READY", "duel.vercel.app", "Fix bug")
    assert "vtok-secret" not in r.text
    assert all(req.headers["authorization"] == "Bearer vtok-secret" for req in seen)
    assert r.json()["render"] == {"configured": False}


def test_hosting_caches_each_provider_for_five_minutes_unless_refreshed_667(api, monkeypatch):
    c, S = api
    _hosting_env(monkeypatch, VERCEL_TOKEN="vtok", VERCEL_TEAM_ID="team_1")
    seen = _mock(monkeypatch, _vercel_handler)
    login(c, S, mk(S, ADMIN_EMAIL, "admin"))
    c.get("/admin/hosting")
    n = len(seen)
    c.get("/admin/hosting")
    assert len(seen) == n
    c.get("/admin/hosting", params={"refresh": 1})
    assert len(seen) == 2 * n


def test_a_failing_provider_reports_an_error_without_the_token_or_breaking_the_others_667(api, monkeypatch):
    c, S = api
    _hosting_env(monkeypatch, VERCEL_TOKEN="vtok-secret", RENDER_API_KEY="rtok-secret")

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "api.vercel.com":
            return httpx.Response(401, json={"error": "bad token vtok-secret"})
        raise httpx.ConnectTimeout("timed out for rtok-secret", request=request)

    _mock(monkeypatch, handler)
    login(c, S, mk(S, ADMIN_EMAIL, "admin"))
    r = c.get("/admin/hosting")
    data = r.json()
    assert data["vercel"]["configured"] is True and data["vercel"]["error"] == "HTTP 401"
    assert data["render"]["configured"] is True and "ConnectTimeout" in data["render"]["error"]
    assert data["github"] == {"configured": False}
    assert "secret" not in r.text


def test_hosting_reads_render_services_and_their_latest_deploy_667(api, monkeypatch):
    c, S = api
    _hosting_env(monkeypatch, RENDER_API_KEY="rtok")

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/v1/services":
            return httpx.Response(200, json=[{"service": {"id": "srv-1", "name": "optcg-api", "type": "web_service", "suspended": "not_suspended", "serviceDetails": {"url": "https://api.example"}}}])
        assert request.url.path == "/v1/services/srv-1/deploys"
        return httpx.Response(200, json=[{"deploy": {"status": "live", "finishedAt": "2026-10-20T10:00:00Z", "commit": {"id": "abcdef123", "message": "Ship it"}}}])

    _mock(monkeypatch, handler)
    login(c, S, mk(S, ADMIN_EMAIL, "admin"))
    svc = c.get("/admin/hosting").json()["render"]["services"][0]
    assert svc == {"name": "optcg-api", "type": "web_service", "suspended": False, "url": "https://api.example", "latest": {"status": "live", "finished_at": "2026-10-20T10:00:00Z", "commit": "Ship it"}}


def test_hosting_reads_github_and_treats_hidden_traffic_as_null_667(api, monkeypatch):
    c, S = api
    _hosting_env(monkeypatch, GITHUB_TOKEN="gtok", GITHUB_REPO="o/r")

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == "/repos/o/r":
            return httpx.Response(200, json={"stargazers_count": 7, "open_issues_count": 3})
        if path == "/repos/o/r/pulls":
            return httpx.Response(200, json=[{}, {}])
        if path == "/repos/o/r/actions/runs":
            assert request.url.params["branch"] == "main"
            return httpx.Response(200, json={"workflow_runs": [{"name": "CI", "conclusion": "success", "created_at": "t", "html_url": "u"}]})
        if path == "/repos/o/r/actions/workflows/bot-selfplay.yml/runs":
            return httpx.Response(200, json={"workflow_runs": [{"name": "bot", "conclusion": "failure", "created_at": "t2", "html_url": "u2"}]})
        if path == "/repos/o/r/commits":
            return httpx.Response(200, json=[{}] * 5)
        assert path == "/repos/o/r/traffic/views"
        return httpx.Response(403, json={})

    _mock(monkeypatch, handler)
    login(c, S, mk(S, ADMIN_EMAIL, "admin"))
    gh = c.get("/admin/hosting").json()["github"]
    assert (gh["stars"], gh["open_issues"], gh["open_prs"], gh["commits_7d"], gh["traffic_views"]) == (7, 3, 2, 5, None)
    assert gh["ci_runs"][0]["conclusion"] == "success" and gh["bot_runs"][0]["conclusion"] == "failure"


# ------------------------------------------------------------------ startup

def test_startup_makes_only_the_admin_email_admin_and_adds_the_columns_667(monkeypatch):
    engine = make_bare_engine()
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE users (id INTEGER PRIMARY KEY, email VARCHAR(320) NOT NULL UNIQUE, name VARCHAR(255), "
                "google_sub VARCHAR(255) NOT NULL UNIQUE, created_at TIMESTAMP)"
            )
        )
        for i, email in enumerate(["GameFreakMichaelTang@gmail.com", "someone@x.test"]):
            conn.execute(text("INSERT INTO users (id, email, name, google_sub) VALUES (:i, :e, 'n', :s)"), {"i": i + 1, "e": email, "s": f"s{i}"})
    monkeypatch.setattr(app_db, "engine", engine)
    app_db._ensure_user_role_columns()
    with engine.begin() as conn:
        conn.execute(text("UPDATE users SET role = 'admin' WHERE email = 'someone@x.test'"))
    app_db._ensure_admin_role()
    with engine.connect() as conn:
        roles = dict(conn.execute(text("SELECT lower(email), role FROM users")).all())
        cols = conn.execute(text("SELECT banned_at, ban_reason, banned_by FROM users")).all()
    assert roles == {"gamefreakmichaeltang@gmail.com": "admin", "someone@x.test": "user"}
    assert cols == [(None, None, None)] * 2
    with engine.connect() as conn:
        assert conn.execute(text("SELECT lower(email), role FROM users WHERE email = 'someone@x.test'")).one()[1] == "user"
    assert {"role", "banned_at", "ban_reason", "banned_by"} <= {c["name"] for c in inspect(engine).get_columns("users")}
    engine.dispose()
