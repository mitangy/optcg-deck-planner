"""Instagram auto-poster tables (#1477).

New tables ``instagram_posts`` (one row per UTC day, unique ``slot_date``) and ``instagram_token``
(the refreshed access token, single row, with the sha256 of the env token it came from).

Idempotent: each table is skipped when it already exists.

Revision ID: 0014
Revises: 0013
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "instagram_posts" not in tables:
        op.create_table(
            "instagram_posts",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("kind", sa.String(length=32), nullable=False),
            sa.Column("slot_date", sa.Date(), nullable=False),
            sa.Column("caption", sa.Text(), nullable=False),
            sa.Column("image_jpeg", sa.LargeBinary(), nullable=False),
            sa.Column("media_token", sa.String(length=64), nullable=False),
            sa.Column("subject", sa.String(length=64), nullable=False),
            sa.Column("status", sa.String(length=16), nullable=False),
            sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
            sa.Column("ig_media_id", sa.String(length=64), nullable=True),
            sa.Column("error", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("slot_date"),
            sa.UniqueConstraint("media_token"),
        )
        op.create_index(op.f("ix_instagram_posts_subject"), "instagram_posts", ["subject"])
    if "instagram_token" not in tables:
        op.create_table(
            "instagram_token",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("access_token", sa.Text(), nullable=False),
            sa.Column("refreshed_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("env_token_sha256", sa.String(length=64), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )


def downgrade() -> None:
    op.drop_table("instagram_token")
    op.drop_table("instagram_posts")
