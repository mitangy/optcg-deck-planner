"""Hourly prices for new and upcoming sets (#840)."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone

import httpx
import pytest

from app import catalog_sync, price_refresh
from app.config import Settings
from app.models import CatalogCard, CatalogPrinting

NOW = datetime(2026, 10, 31, 12, 0, tzinfo=timezone.utc)


@pytest.fixture(autouse=True)
def _no_page_pause(monkeypatch):
    monkeypatch.setattr(price_refresh, "PAGE_PAUSE_S", 0)


def _group(group_id: int, published: str) -> dict:
    return {"groupId": group_id, "name": f"Set {group_id}", "publishedOn": published}


def _product(pid: int, market: float | None, low: float | None) -> dict:
    return {"productId": float(pid), "marketPrice": market, "lowestPrice": low}


def _client(groups: list[dict], products: dict[int, list[dict]], failing: set[int] = frozenset(), calls=None):
    """A TCGCSV groups endpoint plus a TCGPlayer search endpoint, both faked."""

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            assert request.url.path.endswith("/groups")
            return httpx.Response(200, json={"results": groups})
        body = json.loads(request.content)
        group_id = body["filters"]["term"]["setId"][0]
        start = body["from"]
        if calls is not None:
            calls.append((group_id, start))
        if group_id in failing:
            return httpx.Response(500, json={"results": [{"totalResults": 0, "results": []}]})
        rows = products.get(group_id, [])
        page = rows[start : start + 50]
        return httpx.Response(200, json={"results": [{"totalResults": len(rows), "results": page}]})

    return httpx.Client(transport=httpx.MockTransport(handler))


def _printing(card_id: str, pid: int, name: str, market: float | None, group: str = "Set 1") -> CatalogPrinting:
    return CatalogPrinting(
        card_id=card_id, product_id=pid, name=name, market_price=market, low_price=market,
        group_name=group, is_special=0,
    )


def _card(card_id: str, market: float | None) -> CatalogCard:
    return CatalogCard(card_id=card_id, name=card_id, market_price=market, low_price=market)


def test_new_release_window_keeps_recent_and_upcoming_sets_840():
    groups = [
        _group(1, "2026-10-21T00:00:00"),
        _group(2, "2026-12-05T00:00:00"),
        _group(3, "2026-09-01T00:00:00"),
        _group(4, "2026-10-01T12:00:00"),  # exactly 30 days before NOW
        _group(5, "2026-10-01T11:59:59"),  # a second too old
        {"groupId": 6, "name": "no date"},
        _group(7, "soon"),
    ]
    kept = price_refresh.recent_groups(groups, NOW, 30)
    assert [g["groupId"] for g in kept] == [1, 2, 4]


def test_a_set_on_two_pages_gets_every_price_840():
    rows = [_product(1000 + i, i + 0.5, i + 0.25) for i in range(60)]
    calls: list = []
    client = _client([], {24820: rows}, calls=calls)
    prices = price_refresh.fetch_group_prices(client, 24820)
    assert len(prices) == 60
    assert prices[1000] == (0.5, 0.25)
    assert prices[1059] == (59.5, 59.25)
    assert calls == [(24820, 0), (24820, 50)]


def test_unrounded_search_prices_are_stored_in_cents_840():
    client = _client([], {7: [_product(70, 12.4328, 0.456), _product(71, None, 3.0)]})
    assert price_refresh.fetch_group_prices(client, 7) == {70: (12.43, 0.46), 71: (None, 3.0)}


def test_a_failed_page_raises_instead_of_returning_half_a_set_840():
    client = _client([], {}, failing={5})
    with pytest.raises(httpx.HTTPStatusError):
        price_refresh.fetch_group_prices(client, 5)


def test_new_prices_repick_the_cards_preferred_printing_840(db):
    db.add_all(
        [
            _card("OP18-001", 5.0),
            _printing("OP18-001", 1, "Zoro", 5.0),
            _printing("OP18-001", 2, "Zoro (Reprint)", 6.0),
            _printing("OP18-001", 3, "Zoro (Alternate Art)", 2.0),
            _card("OP18-002", 10.0),
            _printing("OP18-002", 4, "Nami", 10.0),
            _printing("OP18-002", 5, "Nami (Alternate Art)", 3.0),
        ]
    )
    db.commit()
    # Product 1 gets dearer than product 2, and the alt stays far cheaper than any standard.
    prices = {1: (8.0, 7.5), 2: (6.0, 5.5), 3: (1.0, 0.5), 4: (12.0, 11.0), 5: (4.0, 3.0)}
    result = price_refresh.apply_prices(db, prices, NOW)
    assert result["printings_updated"] == 5
    zoro = db.get(CatalogCard, "OP18-001")
    assert (zoro.market_price, zoro.low_price, zoro.is_special) == (6.0, 5.5, 0)
    nami = db.get(CatalogCard, "OP18-002")
    assert (nami.market_price, nami.low_price, nami.is_special) == (12.0, 11.0, 0)
    alt = db.query(CatalogPrinting).filter_by(product_id=3).one()
    assert (alt.market_price, alt.is_special) == (1.0, 1)


def test_unchanged_prices_update_nothing_840(db):
    db.add_all([_card("OP18-001", 5.0), _printing("OP18-001", 1, "Zoro", 5.0)])
    db.commit()
    assert price_refresh.apply_prices(db, {1: (5.0, 5.0)}, NOW) == {"printings_updated": 0, "cards_updated": 0}
    assert price_refresh.apply_prices(db, {1: (6.0, 5.0)}, NOW) == {"printings_updated": 1, "cards_updated": 1}
    assert price_refresh.apply_prices(db, {1: (6.0, 5.0)}, NOW) == {"printings_updated": 0, "cards_updated": 0}


def test_only_new_sets_are_fetched_and_older_printings_stay_put_840(db):
    db.add_all(
        [
            _card("EB05-001", 1.0),
            _printing("EB05-001", 10, "Chopper", 1.0, "Extra Booster 05"),
            _card("OP01-001", 7.0),  # stale on purpose: only cards with a new price are re-picked
            _printing("OP01-001", 20, "Luffy", 2.0, "Romance Dawn"),
        ]
    )
    db.commit()
    groups = [_group(24820, "2026-10-30T00:00:00"), _group(1, "2022-12-02T00:00:00")]
    products = {24820: [_product(10, 1.5, 1.25), _product(999, 3.0, 2.0)], 1: [_product(20, 99.0, 98.0)]}
    calls: list = []
    summary = price_refresh.refresh_new_release_prices(db, _client(groups, products, calls=calls), NOW, 30)
    assert calls == [(24820, 0)]
    assert (summary["groups"], summary["products_seen"], summary["printings_updated"]) == (1, 2, 1)
    assert db.get(CatalogCard, "EB05-001").market_price == 1.5
    assert db.get(CatalogCard, "OP01-001").market_price == 7.0
    assert db.query(CatalogPrinting).filter_by(product_id=20).one().market_price == 2.0
    assert db.query(CatalogPrinting).count() == 2  # product 999 is not in the catalog: no new row


def test_one_set_failing_does_not_stop_the_others_840(db):
    db.add_all(
        [
            _card("EB05-001", 1.0),
            _printing("EB05-001", 10, "Chopper", 1.0),
            _card("OP19-001", 1.0),
            _printing("OP19-001", 30, "Sabo", 1.0),
        ]
    )
    db.commit()
    groups = [_group(24820, "2026-10-30T00:00:00"), _group(25000, "2026-11-20T00:00:00")]
    products = {24820: [_product(10, 7.0, 6.0)], 25000: [_product(30, 8.0, 7.0)]}
    summary = price_refresh.refresh_new_release_prices(db, _client(groups, products, failing={24820}), NOW, 30)
    assert summary["failed_groups"] == 1
    assert db.get(CatalogCard, "EB05-001").market_price == 1.0
    assert db.get(CatalogCard, "OP19-001").market_price == 8.0


def _spy_refresh(monkeypatch) -> list:
    seen: list = []

    def fake(db, client, now, days):
        seen.append(days)
        return {"groups": 0}

    monkeypatch.setattr(price_refresh, "refresh_new_release_prices", fake)
    return seen


def _lock_is_free() -> bool:
    if not catalog_sync._sync_lock.acquire(blocking=False):
        return False
    catalog_sync._sync_lock.release()
    return True


def test_a_refresh_waits_while_the_full_catalog_sync_runs_840(monkeypatch):
    seen = _spy_refresh(monkeypatch)
    assert catalog_sync.try_claim_sync_slot()
    try:
        assert price_refresh.run_once(30) is None
        assert seen == []
    finally:
        catalog_sync._sync_state["running"] = False
        if catalog_sync._sync_advisory is not None:
            catalog_sync._sync_advisory.release()
            catalog_sync._sync_advisory = None
        catalog_sync._sync_lock.release()
    assert price_refresh.run_once(14) == {"groups": 0}
    assert seen == [14]


def test_a_refresh_leaves_the_catalog_syncs_status_and_lock_alone_840(monkeypatch):
    _spy_refresh(monkeypatch)
    monkeypatch.setitem(catalog_sync._sync_state, "finished_at", "2026-10-30T00:00:00+00:00")
    before = dict(catalog_sync._sync_state)
    price_refresh.run_once(30)
    assert catalog_sync._sync_state == before
    assert _lock_is_free()


def test_a_refresh_gives_up_and_frees_the_lock_when_another_worker_syncs_840(monkeypatch):
    import app.db as app_db

    seen = _spy_refresh(monkeypatch)
    monkeypatch.setattr(app_db, "try_advisory_lock", lambda key, bind=None: None)
    assert price_refresh.run_once(30) is None
    assert seen == []
    assert _lock_is_free()


def test_new_release_prices_are_on_in_production_and_off_elsewhere_unless_set_840():
    prod = {"frontend_origin": "https://app.example"}
    assert Settings(**prod).new_release_prices_enabled is True
    assert Settings().new_release_prices_enabled is False
    assert Settings(**prod, new_release_prices=False).new_release_prices_enabled is False
    assert Settings(new_release_prices=True).new_release_prices_enabled is True


def test_the_refresh_interval_is_never_under_fifteen_minutes_840():
    assert Settings(new_release_price_interval_minutes=1).new_release_price_interval_s == 15 * 60
    assert Settings(new_release_price_interval_minutes=120).new_release_price_interval_s == 120 * 60


def test_the_hourly_task_only_starts_when_enabled_and_uses_the_settings_840(monkeypatch):
    import app.tournament_sync as ts

    captured: dict = {}
    ran: list = []

    async def fake_loop(run, first_delay, interval):
        captured.update(run=run, first_delay=first_delay, interval=interval)

    monkeypatch.setattr(ts, "sync_loop", fake_loop)
    monkeypatch.setattr(price_refresh, "run_once", lambda days: ran.append(days))

    async def go():
        assert price_refresh.start_background(Settings(new_release_prices=False)) is None
        task = price_refresh.start_background(
            Settings(new_release_prices=True, new_release_price_days=9, new_release_price_interval_minutes=120)
        )
        assert task is not None
        await task

    asyncio.run(go())
    assert captured["interval"] == 7200
    captured["run"]()
    assert ran == [9]
