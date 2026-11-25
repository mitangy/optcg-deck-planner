"""Catalog card effect text, attribute and traits for search (#1471).

New catalog_cards columns ``effect_text``, ``attribute`` and ``traits`` (empty by default). The
next catalog sync fills them.

Idempotent: each column is skipped when it already exists.

Revision ID: 0013
Revises: 0012
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None

_TABLE = "catalog_cards"
_COLUMNS = (
    ("effect_text", sa.Text()),
    ("attribute", sa.String(64)),
    ("traits", sa.Text()),
)


def upgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in sa.inspect(bind).get_columns(_TABLE)}
    for name, type_ in _COLUMNS:
        if name not in cols:
            op.add_column(_TABLE, sa.Column(name, type_, nullable=False, server_default=""))


def downgrade() -> None:
    with op.batch_alter_table(_TABLE) as batch:
        for name, _ in reversed(_COLUMNS):
            batch.drop_column(name)
