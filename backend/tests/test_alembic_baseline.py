"""The Alembic baseline (backend/migrations) builds the same schema as init_db.

Production is built by ``init_db`` (create_all plus the ad-hoc ``_ensure_*``
ALTER helpers) and will be marked with ``alembic stamp`` at cutover, so the
baseline must describe exactly what init_db produces. Each test builds one
database with ``init_db`` and one with ``alembic upgrade head``, reflects both
with the SQLAlchemy inspector and compares tables, columns (type, nullability,
server default), primary keys, indexes, unique constraints and foreign keys.
Runs on SQLite by default and on Postgres under TEST_DATABASE_URL.
"""

from __future__ import annotations

import warnings
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, inspect, text
from sqlalchemy import exc as sa_exc

from app import db as app_db
from tests.db_support import make_bare_engine

_BACKEND = Path(__file__).resolve().parents[1]


def _alembic_config() -> Config:
    return Config(str(_BACKEND / "alembic.ini"))


def _expression_indexes(engine: Engine) -> dict[str, str]:
    """Expression indexes (lower(username)); the inspector cannot reflect them."""
    if engine.dialect.name == "postgresql":
        sql = "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexdef LIKE '%(lower(%'"
    else:
        sql = "SELECT name, sql FROM sqlite_master WHERE type = 'index' AND sql LIKE '%(lower(%'"
    with engine.connect() as conn:
        return {name: " ".join(definition.lower().split()) for name, definition in conn.execute(text(sql))}


def _describe(engine: Engine) -> dict[str, dict]:
    """Everything the schema comparison cares about, as plain sorted data."""
    with warnings.catch_warnings():
        # "Skipped unsupported reflection of expression-based index": handled above.
        warnings.simplefilter("ignore", sa_exc.SAWarning)
        return _describe_tables(engine)


def _describe_tables(engine: Engine) -> dict[str, dict]:
    insp = inspect(engine)
    dialect = engine.dialect
    schema: dict[str, dict] = {"<expression indexes>": _expression_indexes(engine)}
    for table in sorted(insp.get_table_names()):
        if table == "alembic_version":
            continue
        pk = insp.get_pk_constraint(table)
        schema[table] = {
            "columns": {
                col["name"]: (
                    col["type"].compile(dialect=dialect),
                    col["nullable"],
                    None if col["default"] is None else str(col["default"]),
                )
                for col in insp.get_columns(table)
            },
            "primary_key": (pk.get("name"), tuple(pk["constrained_columns"])),
            "indexes": sorted(
                (
                    ix["name"],
                    tuple(ix["column_names"]),
                    tuple(ix.get("expressions") or ()),
                    bool(ix["unique"]),
                )
                for ix in insp.get_indexes(table)
            ),
            "unique_constraints": sorted(
                (uc["name"], tuple(uc["column_names"])) for uc in insp.get_unique_constraints(table)
            ),
            "foreign_keys": sorted(
                (
                    fk["name"],
                    tuple(fk["constrained_columns"]),
                    fk["referred_table"],
                    tuple(fk["referred_columns"]),
                    str((fk.get("options") or {}).get("ondelete")),
                )
                for fk in insp.get_foreign_keys(table)
            ),
        }
    return schema


def _schema_from_init_db(monkeypatch: pytest.MonkeyPatch) -> dict[str, dict]:
    engine = make_bare_engine()
    # init_db and its _ensure_* helpers use the module-level engine.
    monkeypatch.setattr(app_db, "engine", engine)
    app_db.init_db()
    schema = _describe(engine)
    engine.dispose()
    return schema


def _schema_from_alembic() -> dict[str, dict]:
    engine = make_bare_engine()
    cfg = _alembic_config()
    with engine.begin() as conn:
        cfg.attributes["connection"] = conn
        command.upgrade(cfg, "head")
    schema = _describe(engine)
    engine.dispose()
    return schema


def test_alembic_baseline_builds_the_schema_init_db_builds(monkeypatch: pytest.MonkeyPatch) -> None:
    # Built one after the other: on Postgres both use the same (wiped) database.
    expected = _schema_from_init_db(monkeypatch)
    actual = _schema_from_alembic()

    assert sorted(actual) == sorted(expected)
    for table, want in expected.items():
        assert actual[table] == want, f"schema differs for table {table!r}"

