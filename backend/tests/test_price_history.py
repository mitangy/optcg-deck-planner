"""Per-product price history (#946)."""

from __future__ import annotations

from datetime import date

from app import catalog_sync, price_history
from app.models import CatalogCard, CatalogGroup, CatalogPrinting
from tests.friend_support import client  # noqa: F401 - fixture
from tests.test_catalog_sync import _group_urls, _install_fake_tcgcsv, _luffy_product, _prices


def _printing(card_id: str, pid: int, name: str, market: float | None, *, special: int = 0, group: str = "Set A"):
    return CatalogPrinting(
        card_id=card_id, product_id=pid, name=name, market_price=market, low_price=market,
        group_name=group, is_special=special,
    )


def test_prices_recorded_across_a_month_boundary_read_back_in_order_946(db):
    price_history.record_prices(db, date(2026, 2, 1), {7: 12.5})
    price_history.record_prices(db, date(2026, 1, 31), {7: 10.0})
    price_history.record_prices(db, date(2026, 1, 2), {7: 9.0, 8: 99.0})
    db.commit()
    assert price_history.history_points(db, 7) == [
        ("2026-01-02", 9.0),
        ("2026-01-31", 10.0),
        ("2026-02-01", 12.5),
    ]
    assert price_history.history_points(db, 8) == [("2026-01-02", 99.0)]


def test_recording_a_day_again_overwrites_it_and_keeps_other_days_946(db):
    price_history.record_prices(db, date(2026, 3, 4), {7: 5.0})
    price_history.record_prices(db, date(2026, 3, 5), {7: 6.0})
    price_history.record_prices(db, date(2026, 3, 4), {7: 8.0})
    price_history.record_prices(db, date(2026, 3, 5), {7: None})  # no price: keeps the stored one
    db.commit()
    assert price_history.history_points(db, 7) == [("2026-03-04", 8.0), ("2026-03-05", 6.0)]


def test_price_history_for_base_art_picks_the_catalog_printing_not_an_alt_946(client):
    c, S = client
    with S() as db:
        db.add_all(
            [
                CatalogCard(card_id="OP01-001", name="Luffy"),
                _printing("OP01-001", 11, "Luffy", 30.0),
                _printing("OP01-001", 12, "Luffy (Alternate Art)", 5.0, special=1),
                _printing("OP01-001", 13, "Luffy (Reprint)", 2.0),
                _printing("OP02-002", 21, "Other", 1.0),
            ]
        )
        db.add(CatalogGroup(group_id=1, name="Set A", abbreviation="A", published_on=date(2024, 12, 6)))
        db.flush()
        price_history.record_prices(db, date(2026, 1, 1), {11: 28.0, 12: 4.0, 13: 2.0})
        db.commit()

    # 13 is the cheapest non-special printing, so it is the base art even though alt 12 costs more than it.
    base = c.get("/catalog/cards/OP01-001/price-history").json()
    assert base["product_id"] == 13
    assert base["points"] == [["2026-01-01", 2.0]]
    assert base["current"] == 2.0

    alt = c.get("/catalog/cards/OP01-001/price-history?product_id=12").json()
    assert (alt["product_id"], alt["points"]) == (12, [["2026-01-01", 4.0]])

    assert c.get("/catalog/cards/OP01-001/price-history?product_id=21").status_code == 404
    assert c.get("/catalog/cards/NOPE-000/price-history").status_code == 404


def test_price_history_release_date_comes_from_the_printings_set_946(client):
    c, S = client
    with S() as db:
        db.add_all(
            [
                _printing("OP01-001", 11, "Luffy", 3.0, group="Set B"),
                CatalogGroup(group_id=1, name="Set A", published_on=date(2023, 1, 1)),
                CatalogGroup(group_id=2, name="Set B", published_on=date(2024, 12, 6)),
            ]
        )
        db.commit()
    body = c.get("/catalog/cards/OP01-001/price-history").json()
    assert body["released"] == "2024-12-06"
    assert body["group_name"] == "Set B"
    assert body["points"] == []


def test_sync_stores_set_release_dates_and_todays_price_946(db, monkeypatch):
    groups = [{"groupId": 1, "name": "OP01", "abbreviation": "OP01", "publishedOn": "2024-12-06T00:00:00"}]
    products = {"results": [_luffy_product()]}
    _install_fake_tcgcsv(monkeypatch, groups, _group_urls(1, products, _prices()))
    catalog_sync.sync_catalog(db)
    group = db.get(CatalogGroup, 1)
    assert group.published_on == date(2024, 12, 6)
    points = price_history.history_points(db, 111)
    assert [p[1] for p in points] == [5.0]


def test_import_needs_the_catalog_token_946(client):
    c, S = client
    with S() as db:
        db.add(_printing("OP01-001", 11, "Luffy", 3.0))
        db.commit()
    body = {"day": "2025-01-02", "prices": {"11": 4.0}}
    assert c.post("/catalog/price-history/import", json=body).status_code == 401
    bad = c.post("/catalog/price-history/import", json=body, headers={"X-Catalog-Token": "wrong"})
    assert bad.status_code == 401
    with S() as db:
        assert price_history.history_points(db, 11) == []


def test_import_keeps_only_catalog_products_946(client):
    c, S = client
    with S() as db:
        db.add(_printing("OP01-001", 11, "Luffy", 3.0))
        db.commit()
    body = {"day": "2025-01-02", "prices": {"11": 4.0, "999": 50.0, "12": None}}
    resp = c.post("/catalog/price-history/import", json=body, headers={"X-Catalog-Token": "dev-sync-token"})
    assert resp.status_code == 200
    assert resp.json() == {"day": "2025-01-02", "stored": 1}
    with S() as db:
        assert price_history.history_points(db, 11) == [("2025-01-02", 4.0)]
        assert price_history.history_points(db, 999) == []


def test_hourly_refresh_records_catalog_products_and_the_latest_price_of_the_day_wins_946(db):
    from datetime import datetime, timezone

    from app import price_refresh

    db.add(_printing("OP01-001", 11, "Luffy", 3.0))
    db.commit()
    morning = datetime(2026, 10, 31, 8, 0, tzinfo=timezone.utc)
    evening = datetime(2026, 10, 31, 20, 0, tzinfo=timezone.utc)
    price_refresh.apply_prices(db, {11: (4.0, 3.5), 500: (9.0, 9.0)}, morning)
    price_refresh.apply_prices(db, {11: (4.5, 3.5), 500: (9.0, 9.0)}, evening)
    assert price_history.history_points(db, 11) == [("2026-10-31", 4.5)]
    assert price_history.history_points(db, 500) == []  # sealed product, not a catalog printing
