"""Group buy members who are not on the app (#1445).

New nullable ``users.placeholder_group_buy_id``: a placeholder user is a name the host typed for a
friend who does not use the app. It belongs to exactly one group buy and goes with it.

Idempotent: skipped when the column already exists.

Revision ID: 0012
Revises: 0011
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None

_TABLE = "users"
_COLUMN = "placeholder_group_buy_id"
_INDEX = "ix_users_placeholder_group_buy_id"
_FK = "fk_users_placeholder_group_buy_id"


def upgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in sa.inspect(bind).get_columns(_TABLE)}
    if _COLUMN in cols:
        return
    if bind.dialect.name == "sqlite":
        # SQLite cannot add a constraint later: rebuild the table. The rebuild cannot carry the
        # hand-written expression index on lower(username), so it is created again afterwards.
        with op.batch_alter_table(_TABLE, recreate="always") as batch:
            batch.add_column(sa.Column(_COLUMN, sa.Integer(), nullable=True))
            batch.create_foreign_key(_FK, "group_buys", [_COLUMN], ["id"], ondelete="CASCADE")
            batch.create_index(_INDEX, [_COLUMN])
        op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username_lower ON users (lower(username))")
        return
    op.add_column(_TABLE, sa.Column(_COLUMN, sa.Integer(), nullable=True))
    op.create_index(_INDEX, _TABLE, [_COLUMN])
    op.create_foreign_key(_FK, _TABLE, "group_buys", [_COLUMN], ["id"], ondelete="CASCADE")


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "sqlite":
        op.drop_constraint(_FK, _TABLE, type_="foreignkey")
    op.drop_index(_INDEX, table_name=_TABLE)
    op.drop_column(_TABLE, _COLUMN)
