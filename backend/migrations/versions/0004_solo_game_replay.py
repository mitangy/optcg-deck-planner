"""Bot game replays (#1202).

``replay`` (JSON text) on ``duel_solo_games``: the full replay of a Play vs Bot game, kept to
investigate bot games and to train the bots on human-vs-bot games. Null for practice games and
for games saved before this.

Idempotent: a column that already exists is left alone, so a database that got the column
another way (``create_all``) upgrades cleanly on SQLite and Postgres.

Revision ID: 0004
Revises: 0003
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

_TABLE = "duel_solo_games"


def upgrade() -> None:
    existing = {c["name"] for c in sa.inspect(op.get_bind()).get_columns(_TABLE)}
    if "replay" not in existing:
        op.add_column(_TABLE, sa.Column("replay", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table(_TABLE) as batch:
        batch.drop_column("replay")
