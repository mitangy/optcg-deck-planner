from __future__ import annotations

from sqlalchemy import event

from app.planner import catalog_search
from tests.conftest import add_catalog


def _selects(db, fn) -> int:
    seen: list[str] = []

    def count(conn, cursor, statement, params, context, executemany):  # noqa: ARG001
        if statement.lstrip().upper().startswith("SELECT"):
            seen.append(statement)

    engine = db.get_bind()
    event.listen(engine, "before_cursor_execute", count)
    try:
        fn()
    finally:
        event.remove(engine, "before_cursor_execute", count)
    return len(seen)


def test_fuzzy_index_skips_the_freshness_queries_within_a_minute_1346(db, monkeypatch):
    add_catalog(db, "OP01-001", name="Luffy", product_id=1, market=1.0)
    clock = {"now": 1000.0}
    monkeypatch.setattr(catalog_search.time, "monotonic", lambda: clock["now"])

    assert _selects(db, lambda: catalog_search._fuzzy_index(db)) == 5
    clock["now"] += 30
    assert _selects(db, lambda: catalog_search._fuzzy_index(db)) == 0


def test_fuzzy_index_notices_a_changed_catalog_after_a_minute_1346(db, monkeypatch):
    add_catalog(db, "OP01-001", name="Luffy", product_id=1, market=1.0)
    clock = {"now": 1000.0}
    monkeypatch.setattr(catalog_search.time, "monotonic", lambda: clock["now"])
    assert {cid for cid, _ in catalog_search._fuzzy_index(db)} == {"OP01-001"}

    add_catalog(db, "OP01-002", name="Zoro", product_id=2, market=1.0)
    assert {cid for cid, _ in catalog_search._fuzzy_index(db)} == {"OP01-001"}

    clock["now"] += catalog_search.FUZZY_KEY_TTL_S + 1
    assert {cid for cid, _ in catalog_search._fuzzy_index(db)} == {"OP01-001", "OP01-002"}
