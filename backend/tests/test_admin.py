"""Admin page API, roles and bans (#667)."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from authlib.integrations.httpx_client import AsyncOAuth2Client
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.admin import hosting as admin_hosting
from app.admin import traffic as admin_traffic
from app.core import db as app_db
from app.core import seed
from app.core.auth import (
    OAUTH_NONCE_COOKIE,
    SESSION_COOKIE,
    create_login_ticket,
    create_oauth_state,
    create_session_token,
    new_oauth_nonce,
)
from app.core.config import Settings, get_settings
from app.analyst.models import (
    AnalystAccess,
    AnalystEvalRun,
    AnalystThread,
    AnalystToken,
    AnalystUsage,
    BotMatch,
)
from app.core.models import User
from app.duel.models import (
    DuelCosmetic,
    DuelMatch,
    DuelMatchLog,
    DuelMatchProgress,
    DuelMatchSeat,
    DuelRating,
    DuelSavedDeck,
    DuelSoloGame,
    PlayerReport,
    PlayerWarning,
)
from app.planner.models import Deck, Owned
from app.social.models import DuelLobbySeen, DuelPresence, Friendship
from app.roles import can_ban, can_delete, can_set_role
from tests.test_duel import client  # noqa: F401  (fixture)

ADMIN_EMAIL = "optcgduel@gmail.com"
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
    admin_traffic.clear_cache()
    yield client
    admin_hosting.clear_cache()
    admin_traffic.clear_cache()
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
    for path in ("/admin/overview", "/admin/bots", "/admin/hosting", "/admin/traffic"):
        assert c.get(path).status_code == 403, path
    login(c, S, admin)
    assert c.get("/admin/me").json()["can"] == {"analytics": True, "set_roles": True, "ban": True, "delete": True}
    for path in ("/admin/overview", "/admin/bots", "/admin/hosting", "/admin/traffic"):
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
    from app.analyst.access import is_chat_owner, is_model_admin

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


def test_banned_users_log_pose_tokens_are_refused_668(api):
    from app.analyst.models import AnalystAccess
    from app.analyst.auth import mint_chat_token

    c, S = api
    mod, plain = mk(S, "mod@x.test", "moderator"), mk(S, "p@x.test")
    with S() as db:
        db.add(AnalystAccess(user_id=plain, status="approved"))
        db.commit()
        chat_token, _ = mint_chat_token(get_settings(), db.get(User, plain), int(datetime.now(timezone.utc).timestamp()))
    login(c, S, plain)
    personal = c.post("/analyst/token").json()["token"]
    personal_h, chat_h = {"X-Analyst-Token": personal, **SERVICE}, {"X-Analyst-Token": chat_token, **SERVICE}
    c.cookies.clear()
    assert c.get("/analyst/me", headers=personal_h).status_code == 200
    assert c.get("/analyst/chat/budget", headers=chat_h).json()["allowed"] is True
    login(c, S, mod)
    assert c.post(f"/admin/users/{plain}/ban").status_code == 200
    c.cookies.clear()
    assert c.get("/analyst/me", headers=personal_h).status_code == 403
    assert c.get("/analyst/decks", headers=personal_h).status_code == 403
    assert c.get("/analyst/me", headers=chat_h).status_code == 403
    assert c.get("/analyst/chat/budget", headers=chat_h).status_code == 403


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


def _claim(c, S, uid: int, source=None):
    with S() as db:
        ticket = create_login_ticket(db, uid, get_settings())
    body = {"ticket": ticket} if source is None else {"ticket": ticket, "source": source}
    r = c.post("/auth/claim", json=body)
    assert r.status_code == 200
    with S() as db:
        return db.get(User, uid).signup_source


def test_a_new_accounts_first_touch_source_is_saved_at_sign_in_905(api):
    c, S = api
    uid = mk(S, "fresh@x.test", created_at=NOW - timedelta(minutes=2))
    saved = _claim(c, S, uid, {"ref": "google.com", "land": "/decks", "utm_source": "ig", "bogus": "x"})
    assert json.loads(saved) == {"ref": "google.com", "land": "/decks", "utm_source": "ig"}


def test_a_returning_account_is_never_given_a_source_at_sign_in_905(api):
    c, S = api
    uid = mk(S, "old@x.test", created_at=NOW - timedelta(hours=2))
    assert _claim(c, S, uid, {"ref": "google.com"}) is None


def test_a_saved_source_is_not_overwritten_by_a_later_sign_in_905(api):
    c, S = api
    uid = mk(S, "twice@x.test", created_at=NOW - timedelta(minutes=2))
    _claim(c, S, uid, {"ref": "google.com"})
    saved = _claim(c, S, uid, {"ref": "reddit.com"})
    assert json.loads(saved) == {"ref": "google.com"}


def test_a_new_account_with_no_source_is_recorded_as_direct_905(api):
    c, S = api
    uid = mk(S, "direct@x.test", created_at=NOW - timedelta(minutes=2))
    assert _claim(c, S, uid) == "{}"


def test_an_oversized_or_dirty_source_is_cut_down_not_rejected_905(api):
    c, S = api
    uid = mk(S, "long@x.test", created_at=NOW - timedelta(minutes=2))
    saved = json.loads(_claim(c, S, uid, {"ref": "a" * 500, "utm_campaign": "ad\x00\n-" + "z" * 200, "land": 7}))
    assert saved["ref"] == "a" * 80
    assert saved["utm_campaign"] == "ad-" + "z" * 57
    assert "land" not in saved


def test_the_admin_user_list_shows_each_accounts_source_or_null_when_unknown_905(api):
    c, S = api
    admin = mk(S, ADMIN_EMAIL, "admin")
    tracked = mk(S, "t@x.test", signup_source='{"ref":"google.com"}')
    direct = mk(S, "d@x.test", signup_source="{}")
    unknown = mk(S, "u@x.test")
    login(c, S, admin)
    rows = {u["id"]: u["signup_source"] for u in c.get("/admin/users").json()["users"]}
    assert rows[tracked] == {"ref": "google.com"} and rows[direct] == {} and rows[unknown] is None


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


def test_overview_days_picks_the_window_for_the_charts_and_top_leaders_691(api):
    c, S = api
    admin = mk(S, ADMIN_EMAIL, "admin", created_at=NOW - timedelta(days=200))
    p = mk(S, "p@x.test", created_at=NOW - timedelta(days=5))
    mk(S, "old@x.test", created_at=NOW - timedelta(days=40))
    with S() as db:
        seat(db, "w1", p, "OP01-001", True, NOW - timedelta(days=2))
        seat(db, "w2", p, "OP05-060", True, NOW - timedelta(days=20))
        seat(db, "w3", p, "OP09-001", False, NOW - timedelta(days=60))
        db.commit()
    login(c, S, admin)
    default = c.get("/admin/overview").json()
    assert default["days"] == 30 and len(default["signups_by_day"]) == 30
    week = c.get("/admin/overview?days=7").json()
    assert week["days"] == 7 and len(week["signups_by_day"]) == 7 and len(week["matches_by_day"]) == 7
    assert [l["leader_id"] for l in week["top_leaders"]] == ["OP01-001"]
    assert sum(m["ranked"] + m["casual"] for m in week["matches_by_day"]) == 1
    quarter = c.get("/admin/overview?days=90").json()
    assert len(quarter["matches_by_day"]) == 90
    assert sorted(l["leader_id"] for l in quarter["top_leaders"]) == ["OP01-001", "OP05-060", "OP09-001"]
    assert sum(s["real"] for s in quarter["signups_by_day"]) == 2  # the admin from 200 days ago is outside
    # The old key stays the last 30 days whatever the window.
    assert sorted(l["leader_id"] for l in quarter["top_leaders_30d"]) == ["OP01-001", "OP05-060"]


def test_overview_and_bots_refuse_a_window_the_page_does_not_offer_691(api):
    c, S = api
    login(c, S, mk(S, ADMIN_EMAIL, "admin"))
    for path in ("/admin/overview", "/admin/bots"):
        for bad in ("0", "8", "365", "abc"):
            assert c.get(f"{path}?days={bad}").status_code == 422, (path, bad)


def test_overview_top_leaders_lists_up_to_25_691(api):
    c, S = api
    admin = mk(S, ADMIN_EMAIL, "admin")
    with S() as db:
        for i in range(30):
            seat(db, f"l{i}", admin, f"OP01-{i + 1:03d}", True, NOW - timedelta(hours=1))
        db.commit()
    login(c, S, admin)
    data = c.get("/admin/overview").json()
    assert len(data["top_leaders"]) == 25


def test_bots_by_day_follows_days_and_leaves_out_older_games_691(api):
    c, S = api
    login(c, S, mk(S, ADMIN_EMAIL, "admin"))
    with S() as db:
        for i, age in enumerate((1, 10, 50)):
            db.add(BotMatch(game_id=f"g{i}", batch_id="b", batch_index=i, leader_a="OP01-001", leader_b="OP05-060", winner=0, turns=7, first_seat=0, replay="{}", created_at=NOW - timedelta(days=age)))
        db.commit()
    default = c.get("/admin/bots").json()
    assert default["days"] == 14 and len(default["bot_games"]["by_day"]) == 14
    assert sum(d["games"] for d in default["bot_games"]["by_day"]) == 2
    week = c.get("/admin/bots?days=7").json()
    assert len(week["bot_games"]["by_day"]) == 7 and sum(d["games"] for d in week["bot_games"]["by_day"]) == 1
    quarter = c.get("/admin/bots?days=90").json()
    assert len(quarter["bot_games"]["by_day"]) == 90 and sum(d["games"] for d in quarter["bot_games"]["by_day"]) == 3
    assert quarter["bot_games"]["total"] == 3  # the totals are not windowed


def test_matches_on_a_day_lists_that_days_duels_with_seats_and_is_admin_only_691(api):
    c, S = api
    admin = mk(S, ADMIN_EMAIL, "admin")
    ann = mk(S, "ann@x.test", name="Ann", username="annie")
    bob = mk(S, "bob@x.test", name="Bob")
    mod = mk(S, "mod@x.test", "moderator")
    day = (NOW - timedelta(days=3)).replace(hour=12, minute=0, second=0, microsecond=0)
    with S() as db:
        for mid, at, ranked, winner, leaders in [
            ("late", day + timedelta(hours=5), False, 1, ("OP01-001", "OP05-060")),
            ("early", day - timedelta(hours=5), True, 0, ("OP09-001", None)),
            ("next-day", day + timedelta(days=1), True, 0, ("OP01-001", "OP01-001")),
            ("prev-day", day - timedelta(days=1), True, 0, ("OP01-001", "OP01-001")),
        ]:
            db.add(
                DuelMatch(
                    match_id=mid, seat0_user_id=ann, seat1_user_id=bob, winner_seat=winner, ranked=ranked, turns=9,
                    seat0_rating_before=1000, seat1_rating_before=1000, seat0_rating_after=1000, seat1_rating_after=1000,
                    seat0_leader_id=leaders[0], seat1_leader_id=leaders[1], created_at=at,
                )
            )
        db.flush()
        # A match from before leaders were stored on it keeps its leader in the seat row.
        db.add(DuelMatchSeat(match_id="early", seat=1, user_id=bob, leader_id="OP02-001", won=True, ranked=True, created_at=day))
        db.commit()
    url = f"/admin/matches?day={day.date().isoformat()}"
    assert c.get(url).status_code == 401
    login(c, S, mod)
    assert c.get(url).status_code == 403
    login(c, S, admin)
    data = c.get(url).json()
    assert data["day"] == day.date().isoformat()
    assert [m["id"] for m in data["matches"]] == ["early", "late"]
    early, late = data["matches"]
    assert (late["ranked"], late["turns"], late["winner_seat"]) == (False, 9, 1)
    assert late["seats"] == [
        {"user_id": ann, "name": "annie", "leader_id": "OP01-001", "won": False},
        {"user_id": bob, "name": "Bob", "leader_id": "OP05-060", "won": True},
    ]
    assert early["seats"][1]["leader_id"] == "OP02-001"
    assert c.get("/admin/matches?day=nope").status_code == 422
    assert c.get("/admin/matches").status_code == 422
    empty = c.get("/admin/matches?day=2001-01-01").json()
    assert empty == {"day": "2001-01-01", "matches": []}


def test_overview_counts_planner_decks_and_log_pose_use_667(api):
    from app.analyst.models import AnalystAccess, AnalystUsage

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
    seed.seed_eval_runs(bind)
    seed.seed_eval_runs(bind)  # a restart must not add them again
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


def _post_eval(c, **over):
    return c.post("/admin/evals", json={"label": "x", "correct": 40, "total": 50, **over}, headers=SERVICE)


def test_an_eval_run_without_a_suite_is_the_main_suite_679(api):
    c, S = api
    assert _post_eval(c).json()["suite"] == "main"
    login(c, S, mk(S, ADMIN_EMAIL, "admin"))
    run = c.get("/admin/bots").json()["evals"][-1]
    assert (run["suite"], run["lower_is_better"], run["metric_name"], run["metric_value"]) == ("main", False, None, None)


def test_an_eval_suite_must_be_one_we_know_679(api):
    c, S = api
    for suite in ("review_facts", "puzzles", "deck_advice", "main"):
        assert _post_eval(c, suite=suite).status_code == 201, suite
    for bad in ("", "Main", "review-facts", "other"):
        assert _post_eval(c, suite=bad).status_code == 422, bad
    login(c, S, mk(S, ADMIN_EMAIL, "admin"))
    assert [e["suite"] for e in c.get("/admin/bots").json()["evals"] if e["label"] == "x"] == ["review_facts", "puzzles", "deck_advice", "main"]


def test_a_headline_metric_and_lower_is_better_round_trip_679(api):
    c, S = api
    r = _post_eval(c, suite="review_facts", metric_name="Wrong claims per review", metric_value=0.85, lower_is_better=True)
    assert r.status_code == 201
    login(c, S, mk(S, ADMIN_EMAIL, "admin"))
    run = c.get("/admin/bots").json()["evals"][-1]
    assert (run["suite"], run["metric_name"], run["metric_value"], run["lower_is_better"]) == ("review_facts", "Wrong claims per review", 0.85, True)
    assert (run["correct"], run["total"]) == (40, 50)


def test_a_run_can_have_only_a_metric_and_then_has_no_score_679(api):
    c, S = api
    body = {"suite": "review_facts", "metric_name": "Wrong per review", "metric_value": 0.0, "lower_is_better": True}
    assert c.post("/admin/evals", json=body, headers=SERVICE).status_code == 201
    login(c, S, mk(S, ADMIN_EMAIL, "admin"))
    run = c.get("/admin/bots").json()["evals"][-1]
    assert (run["correct"], run["total"], run["metric_value"]) == (None, None, 0.0)


def test_an_eval_run_needs_a_score_or_a_whole_metric_679(api):
    c, _ = api
    assert c.post("/admin/evals", json={"label": "empty"}, headers=SERVICE).status_code == 422
    assert c.post("/admin/evals", json={"metric_name": "m"}, headers=SERVICE).status_code == 422
    assert c.post("/admin/evals", json={"metric_value": 1.0}, headers=SERVICE).status_code == 422
    assert c.post("/admin/evals", json={"correct": 3}, headers=SERVICE).status_code == 422
    assert c.post("/admin/evals", json={"correct": 3, "metric_name": "m", "metric_value": 1.0}, headers=SERVICE).status_code == 422
    assert c.post("/admin/evals", json={"total": 3, "metric_name": "m", "metric_value": 1.0}, headers=SERVICE).status_code == 422


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


# ------------------------------------------------------------------ traffic

def _day(offset: int = 0) -> str:
    return (datetime.now(timezone.utc).date() - timedelta(days=offset)).isoformat()


def _web(request: httpx.Request, *, broken: tuple[str, ...] = ()) -> httpx.Response:
    path, q = request.url.path, request.url.params
    if path == "/v9/projects":
        return httpx.Response(200, json={"projects": [{"id": "prj_1", "name": "optcg-duel-web"}, {"id": "prj_3", "name": "tang-budget"}, {"id": "prj_2", "name": "optcg-deck-planner"}]})
    assert path.startswith("/v1/query/web-analytics/visits/")
    if q["projectId"] in broken:
        return httpx.Response(403, json={"error": {"message": "analytics off, token vtok-secret"}})
    if path.endswith("/count"):
        return httpx.Response(200, json={"data": {"pageviews": 90, "visitors": 20}})
    by = q["by"]
    if by == "day":
        # Two active days; the days between have no row at all.
        return httpx.Response(200, json={"data": [
            {"timestamp": f"{_day(2)}T00:00:00.000Z", "visitors": 14, "pageviews": 76},
            {"timestamp": f"{_day(0)}T00:00:00.000Z", "visitors": 9, "pageviews": 14},
        ]})
    rows = {
        "requestPath": [{"requestPath": "/", "visitors": 12, "pageviews": 40}],
        "referrerHostname": [{"referrerHostname": "", "visitors": 66, "pageviews": 321}, {"referrerHostname": "google.com", "visitors": 23, "pageviews": 31}],
        "country": [{"country": "US", "visitors": 8, "pageviews": 9}],
        "deviceType": [{"deviceType": "mobile", "visitors": 5, "pageviews": 6}],
    }[by]
    return httpx.Response(200, json={"data": rows})


def test_traffic_without_tokens_is_not_configured_and_makes_no_calls_1020(api, monkeypatch):
    c, S = api
    seen = _mock(monkeypatch, lambda r: httpx.Response(500))
    login(c, S, mk(S, ADMIN_EMAIL, "admin"))
    assert c.get("/admin/traffic", params={"days": 7}).json() == {"days": 7, "vercel": {"configured": False}, "render": {"configured": False}}
    assert seen == []


def test_traffic_days_must_be_one_of_the_picker_windows_1020(api):
    c, S = api
    login(c, S, mk(S, ADMIN_EMAIL, "admin"))
    assert c.get("/admin/traffic", params={"days": 5}).status_code == 422


def test_traffic_reads_vercel_with_zero_filled_days_and_totals_from_the_count_1020(api, monkeypatch):
    c, S = api
    _hosting_env(monkeypatch, VERCEL_TOKEN="vtok-secret", VERCEL_TEAM_ID="team_1")
    seen = _mock(monkeypatch, _web)
    login(c, S, mk(S, ADMIN_EMAIL, "admin"))
    r = c.get("/admin/traffic", params={"days": 7})
    v = r.json()["vercel"]
    assert v["configured"] is True and [p["name"] for p in v["projects"]] == ["optcg-duel-web", "optcg-deck-planner"]
    p = v["projects"][0]
    assert [d["date"] for d in p["daily"]] == [_day(i) for i in range(6, -1, -1)]
    assert [(d["visitors"], d["pageviews"]) for d in p["daily"]] == [(0, 0)] * 4 + [(14, 76), (0, 0), (9, 14)]
    # 14 + 9 would be wrong: a visitor on two days is one visitor.
    assert p["totals"] == {"visitors": 20, "pageviews": 90}
    assert p["pages"] == [{"key": "/", "visitors": 12, "pageviews": 40}]
    assert p["referrers"][0] == {"key": "", "visitors": 66, "pageviews": 321}
    assert p["countries"][0]["key"] == "US" and p["devices"][0]["key"] == "mobile"
    queries = [rq.url.params for rq in seen if rq.url.path.startswith("/v1/query")]
    assert {q["teamId"] for q in queries} == {"team_1"}
    assert {q["by"] for q in queries if "by" in q} == {"day", "requestPath", "referrerHostname", "country", "deviceType"}
    assert all(q["since"] < q["until"] for q in queries)
    assert "vtok-secret" not in r.text
    assert all(rq.headers["authorization"] == "Bearer vtok-secret" for rq in seen)
    assert r.json()["render"] == {"configured": False}


def test_a_project_whose_analytics_call_fails_is_an_error_row_and_the_other_still_loads_1020(api, monkeypatch):
    c, S = api
    _hosting_env(monkeypatch, VERCEL_TOKEN="vtok-secret")
    _mock(monkeypatch, lambda r: _web(r, broken=("prj_1",)))
    login(c, S, mk(S, ADMIN_EMAIL, "admin"))
    r = c.get("/admin/traffic", params={"days": 7})
    v = r.json()["vercel"]
    assert v["configured"] is True and "error" not in v
    assert v["projects"][0] == {"name": "optcg-duel-web", "error": "HTTP 403"}
    assert v["projects"][1]["totals"] == {"visitors": 20, "pageviews": 90}
    assert "secret" not in r.text


def test_traffic_caches_each_window_for_ten_minutes_unless_refreshed_1020(api, monkeypatch):
    c, S = api
    _hosting_env(monkeypatch, VERCEL_TOKEN="vtok")
    seen = _mock(monkeypatch, _web)
    login(c, S, mk(S, ADMIN_EMAIL, "admin"))
    c.get("/admin/traffic", params={"days": 7})
    n = len(seen)
    c.get("/admin/traffic", params={"days": 7})
    assert len(seen) == n
    c.get("/admin/traffic", params={"days": 14})
    assert len(seen) == 2 * n  # the other window is its own cache entry
    c.get("/admin/traffic", params={"days": 7, "refresh": 1})
    assert len(seen) == 3 * n


def _series(code: str | None, points: list[tuple[str, float]], **extra) -> dict:
    labels = [{"field": "resource", "value": "srv-1"}] + ([{"field": "statusCode", "value": code}] if code else [])
    return {"labels": labels, "unit": "unitless", "values": [{"timestamp": t, "value": v} for t, v in points], **extra}


def _render_handler(request: httpx.Request) -> httpx.Response:
    path, q = request.url.path, request.url.params
    if path == "/v1/services":
        return httpx.Response(200, json=[
            {"service": {"id": "srv-1", "name": "optcg-api", "type": "web_service", "suspended": "not_suspended"}},
            {"service": {"id": "srv-2", "name": "old", "type": "web_service", "suspended": "suspended"}},
            {"service": {"id": "srv-3", "name": "flaky", "type": "web_service", "suspended": "not_suspended"}},
        ])
    if q["resource"] == "srv-3":
        return httpx.Response(500, json={"message": "rtok-secret"})
    assert q["resource"] == "srv-1"
    today, yesterday = f"{_day(0)}T00:00:00Z", f"{_day(1)}T00:00:00Z"
    if path == "/v1/metrics/http-requests":
        assert q["aggregateBy"] == "statusCode" and q["resolutionSeconds"] == "86400"
        return httpx.Response(200, json=[
            _series("200", [(yesterday, 100), (today, 50)]),
            _series("404", [(today, 4)]),
            _series("500", [(yesterday, 2)]),
            _series("503", [(yesterday, 1), (today, 3)]),
        ])
    if path in ("/v1/metrics/cpu", "/v1/metrics/memory"):
        assert int(q["resolutionSeconds"]) * 100 >= 30 * 86400
        two = path.endswith("cpu")
        a, b = (0.25, 0.5) if two else (100.0, 300.0)
        # Two instances: they add up at each timestamp (0.25 + 0.25, 0.5 + 0.5).
        return httpx.Response(200, json=[_series(None, [(yesterday, a), (today, b)]), _series(None, [(yesterday, a), (today, b)])])
    if path == "/v1/metrics/cpu-limit":
        return httpx.Response(200, json=[_series(None, [(today, 1.0)])])
    assert path == "/v1/metrics/memory-limit"
    return httpx.Response(404, json={})


def test_traffic_reads_render_summing_instances_counting_5xx_and_clamping_to_30_days_1020(api, monkeypatch):
    c, S = api
    _hosting_env(monkeypatch, RENDER_API_KEY="rtok-secret")
    seen = _mock(monkeypatch, _render_handler)
    login(c, S, mk(S, ADMIN_EMAIL, "admin"))
    r = c.get("/admin/traffic", params={"days": 90})
    rd = r.json()["render"]
    assert rd["configured"] is True and rd["days"] == 30
    assert [s["name"] for s in rd["services"]] == ["optcg-api", "flaky"]  # the suspended one is skipped
    svc = rd["services"][0]
    assert len(svc["requests_daily"]) == 30
    assert svc["requests_daily"][0] == {"date": _day(29), "total": 0, "errors_5xx": 0}
    assert svc["requests_daily"][-2:] == [{"date": _day(1), "total": 103, "errors_5xx": 3}, {"date": _day(0), "total": 57, "errors_5xx": 3}]
    assert (svc["requests"], svc["errors_5xx"], svc["errors_4xx"]) == (160, 6, 4)
    assert (svc["cpu_avg"], svc["cpu_peak"], svc["cpu_limit"]) == (0.75, 1.0, 1.0)
    assert (svc["memory_avg"], svc["memory_peak"], svc["memory_limit"]) == (400, 600, None)  # a missing limit is null, not an error
    assert rd["services"][1] == {"name": "flaky", "error": "HTTP 500"}
    starts = {rq.url.params["startTime"] for rq in seen if "startTime" in rq.url.params}
    assert starts == {f"{_day(29)}T00:00:00Z"}
    assert "secret" not in r.text
    assert all(rq.headers["authorization"] == "Bearer rtok-secret" for rq in seen)


def test_a_traffic_provider_error_never_carries_the_token_and_is_not_cached_1020(api, monkeypatch):
    c, S = api
    _hosting_env(monkeypatch, VERCEL_TOKEN="vtok-secret", RENDER_API_KEY="rtok-secret")

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "api.vercel.com":
            return httpx.Response(401, json={"error": "bad token vtok-secret"})
        raise httpx.ConnectTimeout("timed out for rtok-secret", request=request)

    seen = _mock(monkeypatch, handler)
    login(c, S, mk(S, ADMIN_EMAIL, "admin"))
    r = c.get("/admin/traffic", params={"days": 7})
    data = r.json()
    assert data["vercel"]["error"] == "HTTP 401" and "ConnectTimeout" in data["render"]["error"]
    assert "secret" not in r.text
    n = len(seen)
    c.get("/admin/traffic", params={"days": 7})
    assert len(seen) == 2 * n


# ------------------------------------------------------------------ startup

def test_startup_makes_only_the_admin_email_admin_667(startup_engine):
    app_db.init_db()
    with startup_engine.begin() as conn:
        for i, email in enumerate(["OptcgDuel@gmail.com", "someone@x.test", "other@x.test"]):
            conn.execute(text("INSERT INTO users (id, email, name, google_sub) VALUES (:i, :e, 'n', :s)"), {"i": i + 1, "e": email, "s": f"s{i}"})
        conn.execute(text("UPDATE users SET role = 'admin' WHERE email = 'someone@x.test'"))
    app_db.init_db()
    with startup_engine.connect() as conn:
        roles = dict(conn.execute(text("SELECT lower(email), role FROM users")).all())
    assert roles == {"optcgduel@gmail.com": "admin", "someone@x.test": "user", "other@x.test": "user"}


def _replay_fixtures(S, p0: int, p1: int) -> None:
    with S() as db:
        db.add(
            DuelMatch(
                match_id="done", seat0_user_id=p0, seat1_user_id=p1, winner_seat=0, turns=6,
                seat0_rating_before=1000, seat1_rating_before=1000, seat0_rating_after=1000, seat1_rating_after=1000,
            )
        )
        db.flush()
        db.add(DuelMatchLog(match_id="done", replay=json.dumps({"seed": 1})))
        db.add(DuelMatchProgress(match_id="cut", seat0_user_id=p0, seat1_user_id=p1, replay=json.dumps({"seed": 2}), closed=True, turns=3))
        db.add(DuelMatchProgress(match_id="live", seat0_user_id=p0, seat1_user_id=p1, replay=json.dumps({"seed": 3}), closed=False))
        db.commit()


def test_admin_opens_another_players_finished_replay_but_nobody_else_can_691(api):
    c, S = api
    admin = mk(S, ADMIN_EMAIL, "admin")
    mod = mk(S, "mod@x.test", "moderator")
    stranger = mk(S, "s@x.test")
    p0, p1 = mk(S, "p0@x.test", name="Zed"), mk(S, "p1@x.test")
    _replay_fixtures(S, p0, p1)
    login(c, S, admin)
    got = c.get("/duel/matches/me/done/replay")
    assert got.status_code == 200
    assert (got.json()["replay"], got.json()["finished"], got.json()["players"][0]) == ({"seed": 1}, True, "Zed")
    for uid in (mod, stranger):
        login(c, S, uid)
        assert c.get("/duel/matches/me/done/replay").status_code == 404
    login(c, S, p1)
    assert c.get("/duel/matches/me/done/replay").json()["your_seat"] == 1


def test_admin_opens_a_closed_cut_off_game_but_a_game_still_being_played_stays_409_691(api):
    c, S = api
    admin = mk(S, ADMIN_EMAIL, "admin")
    mod = mk(S, "mod@x.test", "moderator")
    p0, p1 = mk(S, "p0@x.test"), mk(S, "p1@x.test")
    _replay_fixtures(S, p0, p1)
    login(c, S, admin)
    cut = c.get("/duel/matches/me/cut/replay")
    assert (cut.status_code, cut.json()["finished"], cut.json()["replay"]) == (200, False, {"seed": 2})
    assert c.get("/duel/matches/me/live/replay").status_code == 409
    assert c.get("/duel/matches/me/nope/replay").status_code == 404
    login(c, S, mod)
    assert c.get("/duel/matches/me/cut/replay").status_code == 404
    assert c.get("/duel/matches/me/live/replay").status_code == 404


# ------------------------------------------------------------------ games per mode and the user page (#988)

def duel_game(db: Session, match_id: str, p0: int, p1: int, winner: int, at: datetime, ranked: bool = False,
              leaders: tuple[str, str] = ("OP01-001", "OP02-001"), log: bool = False) -> None:
    db.add(
        DuelMatch(
            match_id=match_id, seat0_user_id=p0, seat1_user_id=p1, winner_seat=winner, ranked=ranked, turns=7,
            reason="life", seat0_rating_before=1000, seat1_rating_before=1000,
            seat0_rating_after=1000, seat1_rating_after=1000, created_at=at,
        )
    )
    db.flush()
    for i, uid in enumerate((p0, p1)):
        db.add(DuelMatchSeat(match_id=match_id, seat=i, user_id=uid, leader_id=leaders[i], won=winner == i,
                             ranked=ranked, turns=7, created_at=at))
    if log:
        db.add(DuelMatchLog(match_id=match_id, replay="{}"))


def befriend(db: Session, a: int, b: int, status: str = "accepted") -> None:
    db.add(Friendship(user_low_id=min(a, b), user_high_id=max(a, b), requester_id=a, status=status))


def solo(db: Session, game_id: str, uid: int, mode: str, at: datetime, won: bool | None = None, leader: str | None = None, level: str | None = None) -> None:
    db.add(DuelSoloGame(game_id=game_id, user_id=uid, mode=mode, won=won, leader_id=leader, bot_level=level, turns=5, created_at=at))


def test_casual_game_against_a_friend_counts_as_friends_and_one_against_a_stranger_as_private_988(api):
    c, S = api
    admin = mk(S, ADMIN_EMAIL, "admin")
    # One friend with a lower id than me and one with a higher id, so both orders of the pair are exercised.
    friend = mk(S, "fr@x.test")
    me, friend_hi, stranger, pending = (mk(S, f"{n}@x.test") for n in ("me", "frhi", "st", "pe"))
    with S() as db:
        befriend(db, friend, me)
        befriend(db, me, friend_hi)
        befriend(db, me, pending, "pending")
        duel_game(db, "f1", me, friend, 0, NOW - timedelta(days=4))
        duel_game(db, "f2", friend, me, 0, NOW - timedelta(days=3))  # me in seat 1, lost
        duel_game(db, "p1", me, stranger, 0, NOW - timedelta(days=2))
        duel_game(db, "p2", me, pending, 1, NOW - timedelta(days=1))
        duel_game(db, "f3", me, friend_hi, 0, NOW - timedelta(days=2, hours=1))
        duel_game(db, "r1", me, friend, 0, NOW - timedelta(hours=5), ranked=True)  # friends but ranked: ranked
        db.commit()
    login(c, S, admin)
    rows = {u["id"]: u for u in c.get("/admin/users").json()["users"]}
    assert rows[me]["games"] == {"ranked": 1, "friends": 3, "private": 2, "bot": 0, "practice": 0}
    assert rows[me]["matches"] == 6
    detail = c.get(f"/admin/users/{me}").json()
    assert [(m["mode"], m["games"], m["wins"]) for m in detail["modes"]] == [
        ("ranked", 1, 1), ("friends", 3, 2), ("private", 2, 1), ("bot", 0, 0), ("practice", 0, 0),
    ]
    assert detail["user"]["games"] == rows[me]["games"]
    assert rows[stranger]["games"]["private"] == 1 and rows[stranger]["games"]["friends"] == 0


def test_bot_and_practice_games_count_per_mode_and_only_bot_games_have_wins_988(api):
    c, S = api
    admin, me = mk(S, ADMIN_EMAIL, "admin"), mk(S, "me@x.test")
    with S() as db:
        solo(db, "b1", me, "bot", NOW - timedelta(hours=3), won=True, level="hard")
        solo(db, "b2", me, "bot", NOW - timedelta(hours=2), won=False, level="normal")
        solo(db, "b3", me, "bot", NOW - timedelta(hours=1), won=True)
        solo(db, "pr1", me, "practice", NOW - timedelta(minutes=5))
        db.commit()
    login(c, S, admin)
    detail = c.get(f"/admin/users/{me}").json()
    assert {m["mode"]: (m["games"], m["wins"]) for m in detail["modes"]} == {
        "ranked": (0, 0), "friends": (0, 0), "private": (0, 0), "bot": (3, 2), "practice": (1, 0),
    }
    assert detail["user"]["matches"] == 0  # solo games are not duel matches
    assert detail["solo_tracked_since"] is not None


def test_ban_unban_and_role_change_return_the_same_game_counts_as_the_list_991(api):
    c, S = api
    admin, me, other = mk(S, ADMIN_EMAIL, "admin"), mk(S, "me@x.test"), mk(S, "other@x.test")
    with S() as db:
        duel_game(db, "m1", me, other, 0, NOW - timedelta(hours=2), ranked=True)
        duel_game(db, "m2", me, other, 1, NOW - timedelta(hours=1))
        solo(db, "b1", me, "bot", NOW - timedelta(minutes=30), won=True)
        db.commit()
    login(c, S, admin)

    def listed():
        return next(u for u in c.get("/admin/users").json()["users"] if u["id"] == me)

    want = listed()
    assert want["matches"] == 2 and want["games"]["ranked"] == 1 and want["games"]["bot"] == 1
    for r in (
        c.post(f"/admin/users/{me}/ban", json={"reason": "x"}),
        c.post(f"/admin/users/{me}/unban"),
        c.put(f"/admin/users/{me}/role", json={"role": "moderator"}),
    ):
        assert r.status_code == 200
        body = r.json()
        assert (body["matches"], body["games"], body["last_match_at"]) == (want["matches"], want["games"], want["last_match_at"])


def test_user_detail_is_staff_only_and_404_for_an_unknown_user_988(api):
    c, S = api
    admin, mod, plain = mk(S, ADMIN_EMAIL, "admin"), mk(S, "mod@x.test", "moderator"), mk(S, "p@x.test")
    assert c.get(f"/admin/users/{plain}").status_code == 401
    login(c, S, plain)
    assert c.get(f"/admin/users/{plain}").status_code == 403
    login(c, S, mod)
    assert c.get(f"/admin/users/{plain}").status_code == 200
    assert c.get("/admin/users/99999").status_code == 404


def test_user_detail_recent_matches_merge_duel_and_solo_games_newest_first_988(api):
    c, S = api
    admin, me = mk(S, ADMIN_EMAIL, "admin"), mk(S, "me@x.test")
    foe = mk(S, "foe@x.test", name="Foe")
    with S() as db:
        db.get(User, foe).username = "FoeName"
        duel_game(db, "old", me, foe, 0, NOW - timedelta(days=3), leaders=("OP01-001", "OP05-060"), log=True)
        solo(db, "mid", me, "bot", NOW - timedelta(days=2), won=False, leader="OP01-001", level="hard")
        duel_game(db, "new", foe, me, 0, NOW - timedelta(days=1), ranked=True)
        db.commit()
    login(c, S, admin)
    recent = c.get(f"/admin/users/{me}").json()["recent_matches"]
    assert [m["id"] for m in recent] == ["new", "mid", "old"]
    new, mid, old = recent
    assert (new["mode"], new["won"], new["opponent"]) == ("ranked", False, {"id": foe, "name": "FoeName"})
    assert (mid["mode"], mid["bot_level"], mid["won"], mid["opponent"], mid["replay"]) == ("bot", "hard", False, None, False)
    assert (old["mode"], old["opponent_leader_id"], old["replay"], old["turns"], old["reason"]) == ("private", "OP05-060", True, 7, "life")


def test_user_detail_recent_matches_stop_at_25_988(api):
    c, S = api
    admin, me, foe = mk(S, ADMIN_EMAIL, "admin"), mk(S, "me@x.test"), mk(S, "foe@x.test")
    with S() as db:
        for i in range(15):  # 30 games in all, interleaved newest first: s0, d0, s1, d1, ...
            solo(db, f"s{i}", me, "bot", NOW - timedelta(minutes=2 * i), won=True)
            duel_game(db, f"d{i}", me, foe, 0, NOW - timedelta(minutes=2 * i + 1))
        db.commit()
    login(c, S, admin)
    recent = c.get(f"/admin/users/{me}").json()["recent_matches"]
    assert len(recent) == 25 and recent[0]["id"] == "s0" and recent[-1]["id"] == "s12"


def test_user_detail_top_leaders_count_duel_and_solo_games_together_988(api):
    c, S = api
    admin, me, foe = mk(S, ADMIN_EMAIL, "admin"), mk(S, "me@x.test"), mk(S, "foe@x.test")
    with S() as db:
        duel_game(db, "d1", me, foe, 0, NOW - timedelta(days=3), leaders=("OP01-001", "OP02-001"))
        solo(db, "s1", me, "bot", NOW - timedelta(days=2), won=True, leader="OP01-001")
        solo(db, "s2", me, "bot", NOW - timedelta(days=1), won=False, leader="OP09-001")
        solo(db, "s3", me, "practice", NOW, leader=None)
        solo(db, "s4", me, "bot", NOW, won=True, leader="OP00-001")
        db.commit()
    login(c, S, admin)
    assert c.get(f"/admin/users/{me}").json()["top_leaders"] == [
        {"leader_id": "OP01-001", "games": 2, "wins": 2},
        {"leader_id": "OP00-001", "games": 1, "wins": 1},
        {"leader_id": "OP09-001", "games": 1, "wins": 0},
    ]


def test_user_detail_log_pose_and_moderation_counts_988(api):
    c, S = api
    admin, me, other = mk(S, ADMIN_EMAIL, "admin", name="Boss"), mk(S, "me@x.test"), mk(S, "o@x.test")
    last_month = NOW.replace(day=1) - timedelta(days=3)
    with S() as db:
        db.add(AnalystAccess(user_id=me, status="approved"))
        for kind, outcome, cost, at in [
            ("chat", "ok", 0.5, NOW), ("chat", "ok", 0.25, last_month), ("chat", "error", 1.0, NOW), ("review", "ok", 2.0, NOW),
        ]:
            db.add(AnalystUsage(user_id=me, kind=kind, outcome=outcome, cost_usd=cost, created_at=at))
        db.add(AnalystUsage(user_id=other, kind="chat", outcome="ok", cost_usd=9.0, created_at=NOW))
        db.add(AnalystThread(user_id=me, title="a"))
        db.add(AnalystThread(user_id=me, title="b"))
        db.add(PlayerReport(reporter_id=other, reported_id=me, reason="toxic", source="match", status="open"))
        db.add(PlayerReport(reporter_id=other, reported_id=me, reason="toxic", source="match", status="dismissed"))
        db.add(PlayerReport(reporter_id=me, reported_id=other, reason="conduct", source="match", status="open"))
        db.add(PlayerWarning(user_id=me, message="be nice"))
        u = db.get(User, me)
        u.banned_at, u.banned_by = NOW, admin
        db.commit()
    login(c, S, admin)
    d = c.get(f"/admin/users/{me}").json()
    lp = d["log_pose"]
    assert (lp["access"], lp["questions_total"], lp["questions_month"], lp["threads"]) == ("approved", 2, 1, 2)
    assert (lp["spend_total_usd"], lp["spend_month_usd"]) == (3.75, 3.5)
    assert lp["last_used_at"] is not None
    assert d["moderation"] == {
        "reports_against": 2, "reports_open": 1, "reports_filed": 1, "warnings": 1, "banned_by": {"id": admin, "name": "Boss"},
    }


def test_user_detail_planner_duel_and_presence_sections_988(api):
    c, S = api
    admin, me, f1, f2, f3, f4 = mk(S, ADMIN_EMAIL, "admin"), *(mk(S, f"{n}@x.test") for n in ("me", "f1", "f2", "f3", "f4"))
    with S() as db:
        db.add_all([Deck(user_id=me, name="A"), Deck(user_id=me, name="B"), Deck(user_id=f1, name="C")])
        db.add_all([Owned(user_id=me, card_id="OP01-001", qty=3), Owned(user_id=me, card_id="OP01-002", qty=1),
                    Owned(user_id=me, card_id="OP01-003", qty=0), Owned(user_id=f1, card_id="OP01-001", qty=9)])
        db.add_all([DuelSavedDeck(user_id=me, deck_id="a", data="{}"), DuelSavedDeck(user_id=me, deck_id="b", deleted=True)])
        db.add_all([DuelCosmetic(user_id=me, kind="playmat", mime="image/png", data=b"x", size=1),
                    DuelCosmetic(user_id=me, kind="cardBack", mime="image/png", data=b"x", size=1, taken_down_at=NOW)])
        befriend(db, me, f1)
        befriend(db, f2, me)
        befriend(db, f3, me, "pending")  # incoming request
        befriend(db, me, f4, "pending")  # one I sent: not waiting on me
        db.add(DuelPresence(user_id=f2, room_id="done", instance_id="i", role="player", phase="finished", updated_at=NOW))
        db.add(DuelRating(user_id=me, rating=1111, games_played=4))
        db.add(DuelPresence(user_id=me, room_id="r1", instance_id="i", role="player", phase="playing", ranked=True, updated_at=NOW))
        db.add(DuelLobbySeen(user_id=me, seen_at=NOW - timedelta(hours=1)))
        db.commit()
    login(c, S, admin)
    d = c.get(f"/admin/users/{me}").json()
    assert d["planner"] == {"decks": 2, "owned_cards": 4, "owned_unique": 2}
    assert d["duel"] == {"saved_decks": 1, "uploads": 2, "uploads_taken_down": 1, "friends": 2, "friend_requests_pending": 1}
    assert d["rating"] == {"rating": 1111, "ranked_games": 4}
    assert d["online"] == {"now": True, "room_role": "player", "ranked": True}
    assert d["last_seen"]["lobby"] is not None and d["last_seen"]["match"] is None
    quiet = c.get(f"/admin/users/{f1}").json()
    assert quiet["online"] == {"now": False, "room_role": None, "ranked": None} and quiet["rating"] is None
    assert c.get(f"/admin/users/{f2}").json()["online"]["now"] is False, "a finished room is not online"
    assert quiet["last_seen_at"] is None and quiet["solo_tracked_since"] is None


def test_user_detail_presence_older_than_the_ttl_is_offline_988(api):
    c, S = api
    admin, me = mk(S, ADMIN_EMAIL, "admin"), mk(S, "me@x.test")
    with S() as db:
        db.add(DuelPresence(user_id=me, room_id="r1", instance_id="i", role="player", phase="playing", updated_at=NOW - timedelta(minutes=10)))
        db.commit()
    login(c, S, admin)
    assert c.get(f"/admin/users/{me}").json()["online"]["now"] is False


def test_deleting_a_user_also_removes_their_solo_games_988(api):
    c, S = api
    admin, me = mk(S, ADMIN_EMAIL, "admin"), mk(S, "me@x.test")
    with S() as db:
        solo(db, "b1", me, "bot", NOW, won=True)
        db.commit()
    login(c, S, admin)
    assert c.delete(f"/admin/users/{me}").status_code == 204
    with S() as db:
        assert db.query(DuelSoloGame).count() == 0
