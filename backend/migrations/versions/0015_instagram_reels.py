"""Instagram Reels (#1482).

New table ``instagram_reels`` (uploaded trailer videos). ``instagram_posts`` gets ``reel_id`` (FK, set null
when the reel is deleted), the chosen song (``audio_id``, ``audio_title``, ``audio_artist``), ``reel_error``
(why a Reel fell back to an image post), and ``image_jpeg`` becomes nullable (a Reel row has no image).

Idempotent: the table and each column are skipped when they already exist.

Revision ID: 0015
Revises: 0014
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None

_FK = "fk_instagram_posts_reel_id"


def upgrade() -> None:
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())
    if "instagram_reels" not in tables:
        op.create_table(
            "instagram_reels",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("title", sa.String(length=120), nullable=False),
            sa.Column("caption", sa.Text(), nullable=False),
            sa.Column("video", sa.LargeBinary(), nullable=False),
            sa.Column("media_token", sa.String(length=64), nullable=False),
            sa.Column("size_bytes", sa.Integer(), nullable=False),
            sa.Column("duration_ms", sa.Integer(), nullable=True),
            sa.Column("uploaded_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("posted_count", sa.Integer(), server_default="0", nullable=False),
            sa.Column("last_posted_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("active", sa.Boolean(), server_default=sa.true(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("media_token"),
        )
    cols = {c["name"]: c for c in sa.inspect(bind).get_columns("instagram_posts")}
    if "reel_id" in cols and cols["image_jpeg"]["nullable"]:
        return
    new = [
        sa.Column("reel_id", sa.Integer(), nullable=True),
        sa.Column("audio_id", sa.String(length=64), nullable=True),
        sa.Column("audio_title", sa.String(length=200), nullable=True),
        sa.Column("audio_artist", sa.String(length=200), nullable=True),
        sa.Column("reel_error", sa.Text(), nullable=True),
    ]
    # batch_alter_table rebuilds the table on SQLite and alters in place on Postgres.
    with op.batch_alter_table("instagram_posts") as batch:
        for col in new:
            if col.name not in cols:
                batch.add_column(col)
        if "reel_id" not in cols:
            batch.create_foreign_key(_FK, "instagram_reels", ["reel_id"], ["id"], ondelete="SET NULL")
        batch.alter_column("image_jpeg", existing_type=sa.LargeBinary(), nullable=True)


def downgrade() -> None:
    with op.batch_alter_table("instagram_posts") as batch:
        batch.drop_constraint(_FK, type_="foreignkey")
        for name in ("reel_error", "audio_artist", "audio_title", "audio_id", "reel_id"):
            batch.drop_column(name)
    op.drop_table("instagram_reels")
