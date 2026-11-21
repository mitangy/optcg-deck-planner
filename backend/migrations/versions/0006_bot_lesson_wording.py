"""Reword bot-drafted Log Pose lessons that show raw line keys (#1408).

Bot lessons (``analyst_lessons.source = 'bots'``) used to read "games where
optional_accepted:EB05-010 were won more often than games without it". The weekly run now
words them with card names ("accepting the optional effect of Name (ID) went with more
wins"). This rewrites the rows already saved in the old template into the new one, with card
names from ``catalog_cards`` (the id when a card is missing or has no name). The
``evidence`` column is left alone. Rows that don't match the old template, and player
lessons, are untouched.

The phrasing mirrors ``linePhrase`` / ``lessonText`` in analyst/src (matches.ts, botGames.ts).

A no-op when ``analyst_lessons`` or ``catalog_cards`` does not exist; works on SQLite and
Postgres. ``downgrade`` does nothing: the old wording is not worth restoring.

Revision ID: 0006
Revises: 0005
"""

from __future__ import annotations

import re
from collections.abc import Callable

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

_ID = r"[A-Z]{2,4}\d{2}-\d{3}|P-\d{3}"

_OLD = re.compile(
    r"^With (?P<leader>.+?), games where (?P<line>[a-z_]+(?::\S+(?: via \S+)?)?) were won "
    r"(?P<dir>more|less) often than games without it: (?P<real>.+?) in real games, "
    r"and (?P<bot>.+?) in bot simulations\. A pattern in the games, not proof of cause\.$"
)

_GENERIC_CHEAT = "putting a Character into play with an effect instead of from hand"


def _humanized(line: str, named: Callable[[str], str]) -> str:
    kind, sep, rest = line.partition(":")
    ids = list(dict.fromkeys(re.findall(_ID, rest))) if sep else []
    label = kind.replace("_", " ")
    return f"{label}: {', '.join(named(i) for i in ids)}" if ids else label


def line_phrase(line: str, named: Callable[[str], str]) -> str:
    kind, sep, rest = line.partition(":")
    has_rest = bool(sep)
    if kind == "leader_activation":
        return "using the Leader's Activate: Main"
    if kind == "activation" and has_rest:
        return f"using the Activate: Main of {named(rest)}"
    if kind == "optional_accepted" and has_rest:
        return f"accepting the optional effect of {named(rest)}"
    if kind == "optional_declined" and has_rest:
        return f"declining the optional effect of {named(rest)}"
    if kind == "counter_event":
        return f"playing the Counter Event {named(rest)}" if has_rest else "playing a Counter Event"
    if kind == "cheat_out":
        if not has_rest:
            return _GENERIC_CHEAT
        m = re.fullmatch(rf"({_ID}) via ({_ID}|rules)", rest)
        if m:
            how = "through the rules" if m.group(2) == "rules" else f"with the effect of {named(m.group(2))}"
            return f"putting {named(m.group(1))} into play {how} instead of from hand"
        ids = list(dict.fromkeys(re.findall(_ID, rest)))
        return f"{_GENERIC_CHEAT}: {', '.join(named(i) for i in ids)}" if ids else _GENERIC_CHEAT
    if kind == "main_event" and has_rest:
        return f"playing the Event {named(rest)}"
    return _humanized(line, named)


def new_text(old: str, named: Callable[[str], str]) -> str | None:
    """The lesson in the new wording, or None when ``old`` is not in the old template."""
    m = _OLD.match(old)
    if not m:
        return None
    wins = "more" if m.group("dir") == "more" else "fewer"
    return (
        f"With {m.group('leader')}, {line_phrase(m.group('line'), named)} went with {wins} wins: "
        f"{m.group('real')} in real games, and {m.group('bot')} in bot simulations "
        "(win rate with it vs without). A pattern in the games, not proof of cause."
    )[:1000]


def upgrade() -> None:
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())
    if "analyst_lessons" not in tables or "catalog_cards" not in tables:
        return
    rows = bind.execute(sa.text("SELECT id, text FROM analyst_lessons WHERE source = 'bots'")).fetchall()
    if not rows:
        return
    names = {
        card_id: (name or "").strip()
        for card_id, name in bind.execute(sa.text("SELECT card_id, name FROM catalog_cards"))
    }

    def named(card_id: str) -> str:
        return f"{names.get(card_id) or card_id} ({card_id})"

    update = sa.text("UPDATE analyst_lessons SET text = :text WHERE id = :id")
    for lesson_id, old in rows:
        rewritten = new_text(old, named)
        if rewritten is not None:
            bind.execute(update, {"id": lesson_id, "text": rewritten})


def downgrade() -> None:
    pass
