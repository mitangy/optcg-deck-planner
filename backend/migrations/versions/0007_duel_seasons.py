"""Ranked seasons (#1405).

New tables ``duel_seasons`` and ``duel_season_standings``. No season row means Season 1,
which began before launch; the first reset creates it and archives the standings.

Idempotent: a table that already exists is left alone, so a database that got it another
way (``create_all``) upgrades cleanly on SQLite and Postgres.

Revision ID: 0007
Revises: 0006
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    tables = sa.inspect(op.get_bind()).get_table_names()
    if "duel_seasons" not in tables:
        op.create_table(
            "duel_seasons",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("number", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(length=64), nullable=False),
            sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("reset_mode", sa.String(length=8), nullable=True),
            sa.Column("ended_by_user_id", sa.Integer(), nullable=True),
            sa.ForeignKeyConstraint(["ended_by_user_id"], ["users.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("number"),
        )
    if "duel_season_standings" not in tables:
        op.create_table(
            "duel_season_standings",
            sa.Column("season_id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("rank", sa.Integer(), nullable=False),
            sa.Column("rating", sa.Integer(), nullable=False),
            sa.Column("games_played", sa.Integer(), nullable=False),
            sa.Column("provisional", sa.Boolean(), nullable=False),
            sa.Column("wins", sa.Integer(), nullable=False),
            sa.Column("losses", sa.Integer(), nullable=False),
            sa.Column("rating_after_reset", sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(["season_id"], ["duel_seasons.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("season_id", "user_id"),
        )


def downgrade() -> None:
    op.drop_table("duel_season_standings")
    op.drop_table("duel_seasons")
