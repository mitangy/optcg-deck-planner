
from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import Engine, inspect

_BACKEND = Path(__file__).resolve().parents[2]


class UnstampedDatabaseError(RuntimeError):
    """The database has the app's tables but no Alembic revision."""


def alembic_config() -> Config:
    return Config(str(_BACKEND / "alembic.ini"))


def upgrade_to_head(bind: Engine) -> bool:
    cfg = alembic_config()
    cfg.attributes["configure_logger"] = False
    with bind.begin() as conn:
        cfg.attributes["connection"] = conn
        revision = MigrationContext.configure(conn).get_current_revision()
        if revision is None and inspect(conn).has_table("users"):
            raise UnstampedDatabaseError(
                "This database has tables but no alembic_version. It predates the Alembic "
                "cutover: run `alembic stamp 0001` from backend/ (then restart; 0002 reconciles "
                "the old startup's drift), or point DATABASE_URL at an empty database."
            )
        command.upgrade(cfg, "head")
        return revision is None
