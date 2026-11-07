from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from tests.db_support import make_test_engine
from app.core.config import get_settings
from app.core.db import get_db
from app.duel.tokens import verify_game_token
from app.main import app
from app.core.models import User
from app.duel.models import DuelRating
from app.routers import auth as auth_router
from app.usernames import (
    UsernameError,
    duel_display_name,
    suggest_username,
    username_taken,
    validate_username,
)


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ENABLE_DEV_LOGIN", "true")
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret")
    monkeypatch.setenv("GAME_TOKEN_SECRET", "test-game-token")
    monkeypatch.setenv("FRONTEND_ORIGIN", "http://localhost:5173")
    monkeypatch.setenv("DATABASE_URL", "sqlite://")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "")
    get_settings.cache_clear()
    # Fresh limiter per test so repeated PATCHes don't trip 429.
    monkeypatch.setattr(auth_router, "_username_rate", auth_router.RateLimiter(1000, 60))

    engine = make_test_engine()
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def _override_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_db
    with TestClient(app) as c:
        yield c, SessionLocal
    app.dependency_overrides.clear()
    get_settings.cache_clear()


# --- validation -------------------------------------------------------------


@pytest.mark.parametrize(
    "name",
    ["abc", "Luffy", "straw_hat-99", "A" * 20, "  Zoro  ", "x_y", "Sanji-Kun"],
)
def test_valid_usernames(name):
    assert validate_username(name) == name.strip()


@pytest.mark.parametrize(
    "name",
    [
        "",
        "ab",
        "A" * 21,
        "has space",
        "emoji😀",
        "dot.name",
        "semi;colon",
        "ñandú",
    ],
)
def test_invalid_format_rejected(name):
    with pytest.raises(UsernameError):
        validate_username(name)


@pytest.mark.parametrize(
    "name",
    ["admin", "ADMIN", "Adm1n", "the_admin", "moderator", "Official_Luffy", "guest", "null", "Opponent"],
)
def test_reserved_rejected(name):
    with pytest.raises(UsernameError):
        validate_username(name)


@pytest.mark.parametrize("name", ["fuckface", "Sh1tLord", "f_u_c_k", "xXbitchXx"])
def test_profanity_rejected(name):
    with pytest.raises(UsernameError):
        validate_username(name)


@pytest.mark.parametrize("name", ["grass_type", "document", "spicy_luffy", "classic"])
def test_common_words_not_false_positive(name):
    assert validate_username(name) == name


def test_display_name_fallback(db):
    u = User(email="a@example.com", name="Monkey D Luffy", google_sub="s1")
    assert duel_display_name(u) == "Monkey D Luffy"
    u.username = "StrawHat"
    assert duel_display_name(u) == "StrawHat"
    blank = User(email="b@example.com", name="", google_sub="s2")
    assert duel_display_name(blank) == "Player"


def test_suggestion_is_valid_and_available(db):
    taken = User(email="t@example.com", name="Other", google_sub="t", username="Monkey_D_Luffy")
    me = User(email="luffy@example.com", name="Monkey D. Luffy", google_sub="me")
    db.add_all([taken, me])
    db.commit()
    s = suggest_username(db, me)
    assert validate_username(s) == s
    assert not username_taken(db, s, exclude_user_id=me.id)
    assert s.startswith("Monkey_D_Luffy"[:15])


def test_suggestion_falls_back_for_unusable_names(db):
    me = User(email="x@example.com", name="管理者", google_sub="me2")
    db.add(me)
    db.commit()
    s = suggest_username(db, me)
    # Non-ASCII name sanitizes to nothing → "Pirate_####".
    assert s.startswith("Pirate_")
    assert validate_username(s) == s


# --- uniqueness at the DB layer -----------------------------------------------


def test_db_enforces_case_insensitive_uniqueness(db):
    db.add(User(email="a@example.com", name="A", google_sub="a", username="Nami"))
    db.commit()
    db.add(User(email="b@example.com", name="B", google_sub="b", username="NAMI"))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
    # Multiple users without a username are fine.
    db.add_all(
        [
            User(email="c@example.com", name="C", google_sub="c"),
            User(email="d@example.com", name="D", google_sub="d"),
        ]
    )
    db.commit()


# --- endpoints ----------------------------------------------------------------


def _login(c: TestClient) -> dict:
    r = c.post("/auth/dev-login")
    assert r.status_code == 200, r.text
    return r.json()


def test_me_includes_null_username_then_set(client):
    c, _ = client
    me = _login(c)
    assert me["username"] is None
    assert c.get("/auth/me").json()["username"] is None

    r = c.patch("/auth/me/username", json={"username": "  StrawHat  "})
    assert r.status_code == 200, r.text
    assert r.json()["username"] == "StrawHat"
    assert c.get("/auth/me").json()["username"] == "StrawHat"

    # Changing it later works, including a case-only change of your own name.
    assert c.patch("/auth/me/username", json={"username": "strawhat"}).json()["username"] == "strawhat"
    assert c.patch("/auth/me/username", json={"username": "Zoro_3"}).json()["username"] == "Zoro_3"


def test_set_username_requires_login(client):
    c, _ = client
    assert c.patch("/auth/me/username", json={"username": "Nobody"}).status_code == 401
    assert c.get("/auth/me/username-suggestion").status_code == 401


def test_set_username_invalid_is_422(client):
    c, _ = client
    _login(c)
    for bad in ["ab", "has space", "admin", "fuckface", "x" * 21]:
        r = c.patch("/auth/me/username", json={"username": bad})
        assert r.status_code == 422, (bad, r.text)
        assert isinstance(r.json()["detail"], str)
    # Missing field → FastAPI's own 422.
    assert c.patch("/auth/me/username", json={}).status_code == 422


def test_set_username_conflict_is_409_case_insensitive(client):
    c, SessionLocal = client
    with SessionLocal() as db:
        db.add(User(email="other@x.com", name="Other", google_sub="other", username="Nami"))
        db.commit()
    _login(c)
    r = c.patch("/auth/me/username", json={"username": "nAmI"})
    assert r.status_code == 409, r.text
    assert c.get("/auth/me").json()["username"] is None


def test_username_suggestion_endpoint(client):
    c, _ = client
    _login(c)  # "Dev User"
    r = c.get("/auth/me/username-suggestion")
    assert r.status_code == 200
    s = r.json()["username"]
    assert s == "Dev_User"
    c.patch("/auth/me/username", json={"username": "Chopper"})
    assert c.get("/auth/me/username-suggestion").json()["username"] == "Chopper"


def test_duel_token_and_leaderboard_use_username(client):
    c, SessionLocal = client
    _login(c)
    r = c.post("/duel/token")
    assert r.status_code == 200, r.text
    assert r.json()["display_name"] == "Dev User"
    payload = verify_game_token(r.json()["token"])
    assert payload is not None and payload["name"] == "Dev User"

    c.patch("/auth/me/username", json={"username": "Usopp"})
    r = c.post("/duel/token")
    assert r.json()["display_name"] == "Usopp"
    assert verify_game_token(r.json()["token"])["name"] == "Usopp"

    # The board lists only players with games (#431).
    with SessionLocal() as db:
        db.query(DuelRating).update({"games_played": 1})
        db.commit()
    board = c.get("/duel/leaderboard").json()["entries"]
    assert board[0]["name"] == "Usopp"
    assert board[0]["username"] == "Usopp"
    mine = c.get("/duel/rating/me").json()
    assert mine["name"] == "Usopp"
    assert mine["username"] == "Usopp"
