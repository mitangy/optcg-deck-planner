"""Startup schema migrations (app.db.init_db) on databases created before the
columns existed. ``create_all`` never alters existing tables, so deployed
databases depend on the ad-hoc ``ALTER TABLE`` helpers; these tests build the
old table shapes, seed rows, run init_db and check the rows read back with the
right values. Runs on SQLite by default and on Postgres under TEST_DATABASE_URL.
"""

from __future__ import annotations

import pytest
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from app import db as app_db
from app.models import Deck, DuelMatch, GroupBuy, User
from tests.db_support import make_bare_engine, requires_postgres, using_postgres

_PK = "SERIAL" if using_postgres() else "INTEGER"
_TS = "TIMESTAMP WITH TIME ZONE" if using_postgres() else "TIMESTAMP"

_LEGACY_DDL = [
    # users before session_version / sum_across_leaders / username
    f"""CREATE TABLE users (
        id {_PK} PRIMARY KEY, email VARCHAR(320) NOT NULL UNIQUE, name VARCHAR(255),
        google_sub VARCHAR(255) NOT NULL UNIQUE, created_at {_TS})""",
    # decks before is_main
    f"""CREATE TABLE decks (
        id {_PK} PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users (id),
        name VARCHAR(200) NOT NULL, leader_card_id VARCHAR(32),
        sort_order INTEGER, created_at {_TS})""",
    # group_buys before the Phase 2 ordering / receipt / public columns
    f"""CREATE TABLE group_buys (
        id {_PK} PRIMARY KEY, host_user_id INTEGER NOT NULL REFERENCES users (id),
        title VARCHAR(200), status VARCHAR(32), invite_token VARCHAR(64) NOT NULL UNIQUE,
        created_at {_TS}, locked_at {_TS})""",
    # duel_matches before leader ids / turns (match replays)
    f"""CREATE TABLE duel_matches (
        id {_PK} PRIMARY KEY, match_id VARCHAR(64) NOT NULL UNIQUE,
        seat0_user_id INTEGER NOT NULL REFERENCES users (id), seat1_user_id INTEGER NOT NULL REFERENCES users (id),
        winner_seat INTEGER NOT NULL, reason VARCHAR(64), ranked BOOLEAN,
        seat0_rating_before INTEGER NOT NULL, seat1_rating_before INTEGER NOT NULL,
        seat0_rating_after INTEGER NOT NULL, seat1_rating_after INTEGER NOT NULL, created_at {_TS})""",
    "INSERT INTO users (email, name, google_sub) VALUES ('old@example.com', 'Old', 'sub-old')",
    "INSERT INTO decks (user_id, name, leader_card_id, sort_order) VALUES (1, 'Red Luffy', 'OP01-001', 0)",
    "INSERT INTO group_buys (host_user_id, title, status, invite_token) VALUES (1, 'Old pool', 'open', 'tok-old')",
    "INSERT INTO duel_matches (match_id, seat0_user_id, seat1_user_id, winner_seat, reason, ranked, "
    "seat0_rating_before, seat1_rating_before, seat0_rating_after, seat1_rating_after) "
    "VALUES ('old-match', 1, 1, 0, 'life', TRUE, 1000, 1000, 1016, 984)",
]


@pytest.fixture()
def legacy_engine(monkeypatch: pytest.MonkeyPatch):
    engine = make_bare_engine()
    with engine.begin() as conn:
        for stmt in _LEGACY_DDL:
            conn.execute(text(stmt))
    # init_db and its _ensure_* helpers use the module-level engine.
    monkeypatch.setattr(app_db, "engine", engine)
    yield engine
    engine.dispose()


def _columns(engine, table: str) -> dict[str, dict]:
    return {c["name"]: c for c in inspect(engine).get_columns(table)}


def test_old_rows_get_defaults_for_every_added_column(legacy_engine):
    app_db.init_db()

    with Session(legacy_engine) as db:
        user = db.query(User).one()
        assert user.session_version == 0
        assert user.sum_across_leaders is False
        assert user.username is None
        deck = db.query(Deck).one()
        assert deck.is_main is False
        assert deck.leader_card_id == "OP01-001"
        gb = db.query(GroupBuy).one()
        assert gb.is_public is False
        assert gb.ordered_at is None
        assert gb.external_order_id == ""
        assert gb.order_notes == ""
        assert gb.shipping_cost == 0.0
        assert gb.shipping_split == "equal"
        assert gb.tax_cost == 0.0
        assert gb.receipt_text == ""
        # pre-existing columns are untouched
        assert (gb.title, gb.status, gb.invite_token) == ("Old pool", "open", "tok-old")
        match = db.query(DuelMatch).one()
        assert (match.seat0_leader_id, match.seat1_leader_id, match.turns) == (None, None, None)
        assert (match.match_id, match.seat0_rating_after) == ("old-match", 1016)


def test_every_current_model_column_exists_after_migration(legacy_engine):
    app_db.init_db()
    for model in (User, Deck, GroupBuy, DuelMatch):
        table = model.__table__
        assert set(table.columns.keys()) <= set(_columns(legacy_engine, table.name)), table.name


def test_migrated_database_accepts_new_rows_and_true_flags(legacy_engine):
    app_db.init_db()
    with Session(legacy_engine) as db:
        db.add(User(email="new@example.com", name="New", google_sub="sub-new"))
        db.commit()
        new_user = db.query(User).filter_by(email="new@example.com").one()
        assert new_user.session_version == 0
        db.add(Deck(user_id=new_user.id, name="Main", is_main=True))
        db.add(GroupBuy(host_user_id=new_user.id, invite_token="tok-new", is_public=True))
        db.commit()
        assert db.query(Deck).filter_by(name="Main").one().is_main is True
        assert db.query(GroupBuy).filter_by(invite_token="tok-new").one().is_public is True


def test_init_db_is_idempotent_on_a_migrated_database(legacy_engine):
    app_db.init_db()
    with legacy_engine.begin() as conn:
        conn.execute(text("UPDATE decks SET is_main = :v"), {"v": True})
        conn.execute(text("UPDATE users SET session_version = 3"))
    app_db.init_db()
    with Session(legacy_engine) as db:
        assert db.query(Deck).one().is_main is True
        assert db.query(User).one().session_version == 3


@requires_postgres
def test_postgres_boolean_columns_are_real_booleans_defaulting_false(legacy_engine):
    app_db.init_db()
    for table, column in (("decks", "is_main"), ("users", "sum_across_leaders"), ("group_buys", "is_public")):
        col = _columns(legacy_engine, table)[column]
        assert col["type"].__class__.__name__ == "BOOLEAN", (table, column)
        assert "false" in str(col["default"]).lower(), (table, column)
    assert _columns(legacy_engine, "group_buys")["ordered_at"]["type"].timezone is True


@requires_postgres
def test_startup_waits_for_another_worker_holding_the_startup_lock(legacy_engine):
    """Several uvicorn workers start at once; only one may run the migrations at a time."""
    import threading

    entered = threading.Event()

    def other_worker() -> None:
        with app_db.startup_lock(legacy_engine):
            entered.set()

    with legacy_engine.connect() as holder:
        holder.execute(text("SELECT pg_advisory_lock(:key)"), {"key": app_db.STARTUP_LOCK_KEY})
        worker = threading.Thread(target=other_worker, daemon=True)
        worker.start()
        assert not entered.wait(0.5)
        holder.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": app_db.STARTUP_LOCK_KEY})
        holder.commit()
    assert entered.wait(5)
    worker.join(5)
