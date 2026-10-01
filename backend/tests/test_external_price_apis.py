"""TCGPlayer recent sales and the TCGCSV catalog pull, through the real httpx
client code with replayed HTTP (pytest-recording / vcrpy).

The cassettes in tests/cassettes/test_external_price_apis/ are HAND-CRAFTED
from the response shapes the parsers read; they were not recorded from the live
services. To re-record against the real APIs (needs network; the product ids
and group ids in the tests may need adjusting to ids that exist):

    pytest tests/test_external_price_apis.py --record-mode=rewrite

then update the expected values to the new data. The default (pytest.ini) is
``--record-mode=none``: a request with no matching recorded interaction fails.
Auth headers and key-like query params are stripped by ``vcr_config`` in conftest.
"""

from __future__ import annotations

import httpx
import pytest

from app import catalog_sync, recent_sales
from app.models import CatalogCard, CatalogPrinting


@pytest.fixture(autouse=True)
def _fresh_sales_cache():
    recent_sales._CACHE.clear()
    yield
    recent_sales._CACHE.clear()


@pytest.mark.vcr
def test_recent_sales_skip_unpriced_rows_and_apply_limit():
    sales = recent_sales.fetch_recent_sales(555001, limit=3)

    # Row 3 has no purchasePrice and is dropped; the 4th priced row is cut by limit=3.
    assert [s.price for s in sales] == [12.5, 11.0, 9.99]
    first, no_shipping, light_play = sales
    assert (first.shipping, first.quantity, first.condition) == (1.27, 2, "Near Mint")
    assert first.order_date == "2026-05-02T14:11:03.35+00:00"
    assert (first.variant, first.language) == ("Normal", "English")
    # shippingPrice null -> 0.0, missing quantity -> 1
    assert (no_shipping.shipping, no_shipping.quantity) == (0.0, 1)
    assert light_play.condition == "Lightly Played"


@pytest.mark.vcr
def test_recent_sales_are_cached_per_product():
    first = recent_sales.fetch_recent_sales(555002, limit=3)
    # The cassette holds one response; a second HTTP call would fail the test.
    again = recent_sales.fetch_recent_sales(555002, limit=3)
    narrower = recent_sales.fetch_recent_sales(555002, limit=1)

    assert [s.price for s in first] == [4.25, 4.0, 3.5]
    assert again == first
    assert [s.price for s in narrower] == [4.25]


@pytest.mark.vcr
def test_recent_sales_limit_is_capped_at_ten():
    sales = recent_sales.fetch_recent_sales(555003, limit=50)

    # The request carries limit=10 (cassette URL) and the 12 returned rows are cut to 10.
    assert len(sales) == 10
    assert sales[0].price == 20.0
    assert sales[-1].price == 11.0


@pytest.mark.vcr
def test_recent_sales_http_error_raises_and_is_not_cached():
    with pytest.raises(httpx.HTTPStatusError):
        recent_sales.fetch_recent_sales(555004, limit=3)

    # The retry reaches the second recorded interaction (200).
    sales = recent_sales.fetch_recent_sales(555004, limit=3)
    assert [s.price for s in sales] == [7.5]


@pytest.mark.vcr
def test_recent_sales_empty_when_no_data():
    assert recent_sales.fetch_recent_sales(555005, limit=3) == []


@pytest.mark.vcr
def test_sync_catalog_over_http(db, monkeypatch):
    monkeypatch.setattr(catalog_sync.time, "sleep", lambda *_: None)

    result = catalog_sync.sync_catalog(db)

    # Group 1002's products request returned 500: it is skipped, the others still sync.
    assert result["card_count"] == 3
    assert result["printing_count"] == 4

    luffy = db.get(CatalogCard, "OP01-001")
    # Normal price (5.0) wins over the cheaper Foil row (2.0); the standard printing
    # is preferred over the cheaper alternate art (3.0).
    assert (luffy.name, luffy.market_price, luffy.low_price) == ("Monkey.D.Luffy", 5.0, 4.0)
    assert luffy.is_special == 0
    assert luffy.group_name == "Romance Dawn"
    assert luffy.rarity == "L" and luffy.card_type == "Leader"

    printings = {
        p.product_id: p for p in db.query(CatalogPrinting).filter_by(card_id="OP01-001")
    }
    assert set(printings) == {111, 112}
    assert (printings[112].market_price, printings[112].low_price) == (3.0, 2.5)
    assert printings[112].is_special == 1
    assert printings[111].tcgplayer_url.endswith("/product/111/one-piece-card-game-x")

    don = db.get(CatalogCard, "DON-113")
    assert don is not None and don.market_price == 0.5

    # A group listed after the failed one is still processed; null marketPrice is kept as None.
    zoro = db.get(CatalogCard, "OP04-031")
    assert (zoro.market_price, zoro.low_price, zoro.cost) == (None, 0.75, "3")
    assert zoro.group_name == "Kingdoms of Intrigue"

    # The numberless booster box is not a card.
    assert db.query(CatalogPrinting).filter_by(product_id=299).count() == 0
