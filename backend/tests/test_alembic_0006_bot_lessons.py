"""Revision 0006 rewrites saved bot lessons from the raw-key wording to card names (#1408)."""

from __future__ import annotations

from alembic import command
from sqlalchemy import Engine, text

from tests.db_support import make_bare_engine
from tests.test_alembic_baseline import _alembic_config

_OLD = (
    "With Nami, games where {line} were won {direction} often than games without it: "
    "61% vs 45% (30 and 40 games) in real games, and 70% vs 50% (40 and 60 games) in bot simulations. "
    "A pattern in the games, not proof of cause."
)


def _upgrade(engine: Engine, revision: str) -> None:
    cfg = _alembic_config()
    with engine.begin() as conn:
        cfg.attributes["connection"] = conn
        command.upgrade(cfg, revision)


def _lesson(conn, user_id: int, lesson_id: int, source: str, body: str, evidence: str = "[]") -> None:
    conn.execute(
        text(
            "INSERT INTO analyst_lessons (id, user_id, status, cards, text, evidence, source) "
            "VALUES (:id, :u, 'draft', '', :t, :e, :s)"
        ),
        {"id": lesson_id, "u": user_id, "t": body, "e": evidence, "s": source},
    )


def _text(conn, lesson_id: int) -> str:
    return conn.execute(text("SELECT text FROM analyst_lessons WHERE id = :id"), {"id": lesson_id}).scalar_one()


def test_0006_rewrites_old_bot_lessons_with_catalog_names_and_leaves_the_rest_1408() -> None:
    engine = make_bare_engine()
    _upgrade(engine, "0005")
    old_accepted = _OLD.format(line="optional_accepted:EB05-010", direction="more")
    old_cheat = _OLD.format(line="cheat_out:OP09-051 via OP09-042", direction="less")
    already_new = "With Nami, accepting the optional effect of Nami (OP01-016) went with more wins: x."
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO users (email, name, google_sub) VALUES ('a@b.c', 'A', 'sub-1')"))
        user_id = conn.execute(text("SELECT id FROM users")).scalar_one()
        for card_id, name in [("EB05-010", "Nami"), ("OP09-051", "Buggy"), ("OP09-042", "")]:
            conn.execute(
                text(
                    "INSERT INTO catalog_cards (card_id, name, rarity, color, card_type, image_url, "
                    "tcgplayer_url, group_name, is_special) VALUES (:c, :n, '', '', '', '', '', '', 0)"
                ),
                {"c": card_id, "n": name},
            )
        _lesson(conn, user_id, 1, "bots", old_accepted, evidence='["posted: ' + old_accepted + '"]')
        _lesson(conn, user_id, 2, "bots", old_cheat)
        _lesson(conn, user_id, 3, "bots", already_new)
        _lesson(conn, user_id, 4, "player", old_accepted)

    _upgrade(engine, "0006")

    with engine.connect() as conn:
        assert _text(conn, 1) == (
            "With Nami, accepting the optional effect of Nami (EB05-010) went with more wins: "
            "61% vs 45% (30 and 40 games) in real games, and 70% vs 50% (40 and 60 games) in bot simulations "
            "(win rate with it vs without). A pattern in the games, not proof of cause."
        )
        assert (
            "putting Buggy (OP09-051) into play with the effect of OP09-042 (OP09-042) instead of from hand went with fewer wins:"
            in _text(conn, 2)
        )
        assert _text(conn, 3) == already_new
        assert _text(conn, 4) == old_accepted
        assert old_accepted in conn.execute(text("SELECT evidence FROM analyst_lessons WHERE id = 1")).scalar_one()
    engine.dispose()


def test_0006_is_a_no_op_without_the_catalog_table_1408() -> None:
    engine = make_bare_engine()
    _upgrade(engine, "0005")
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO users (email, name, google_sub) VALUES ('a@b.c', 'A', 'sub-1')"))
        user_id = conn.execute(text("SELECT id FROM users")).scalar_one()
        old = _OLD.format(line="counter_event", direction="more")
        _lesson(conn, user_id, 1, "bots", old)
        conn.execute(text("DROP TABLE catalog_cards"))
    _upgrade(engine, "0006")
    with engine.connect() as conn:
        assert _text(conn, 1) == old
    engine.dispose()
