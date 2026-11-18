
from __future__ import annotations

from typing import Any

import httpx
import pytest

from app.planner import catalog_sync
from app.planner.models import CatalogCard, CatalogPrinting


def _group_urls(group_id: int, products: dict[str, Any], prices: dict[str, Any]) -> dict[str, Any]:
    return {
        f"{catalog_sync.TCGCSV_BASE}/{group_id}/products": products,
        f"{catalog_sync.TCGCSV_BASE}/{group_id}/prices": prices,
    }


def _install_fake_tcgcsv(monkeypatch, groups: list[dict[str, Any]], group_data: dict[str, Any]) -> None:
    monkeypatch.setattr(catalog_sync.time, "sleep", lambda *_: None)
    urls = {f"{catalog_sync.TCGCSV_BASE}/groups": {"results": groups}}
    urls.update(group_data)

    def fake_get_json(client, url):  # noqa: ARG001 - matches _get_json's signature
        return urls[url]

    monkeypatch.setattr(catalog_sync, "_get_json", fake_get_json)


def _luffy_product(product_id: int = 111, image_url: str = "https://tcgplayer.example/111.jpg"):
    return {
        "productId": product_id,
        "name": "Monkey.D.Luffy",
        "imageUrl": image_url,
        "url": "https://tcgplayer.example/product/111",
        "extendedData": [
            {"name": "Number", "value": "OP01-001"},
            {"name": "Rarity", "value": "L"},
            {"name": "CardType", "value": "Leader"},
        ],
    }


def _prices(product_id: int = 111):
    return {"results": [{"productId": product_id, "subTypeName": "Normal", "marketPrice": 5.0, "lowPrice": 4.0}]}


def test_second_sync_preserves_printing_id_and_phash(db, monkeypatch):
    groups = [{"groupId": 1, "name": "OP01"}]
    products = {"results": [_luffy_product()]}
    _install_fake_tcgcsv(monkeypatch, groups, _group_urls(1, products, _prices()))

    result = catalog_sync.sync_catalog(db)
    assert result["printing_count"] == 1

    row = db.query(CatalogPrinting).filter_by(card_id="OP01-001", product_id=111).one()
    row.phash = "abcd1234abcd1234"
    row.phash_source = row.image_url
    db.commit()
    printing_id = row.id

    result2 = catalog_sync.sync_catalog(db)
    assert result2["printing_count"] == 1

    row2 = db.query(CatalogPrinting).filter_by(card_id="OP01-001", product_id=111).one()
    assert row2.id == printing_id
    assert row2.phash == "abcd1234abcd1234"
    assert row2.phash_source == row2.image_url


def test_price_update_does_not_reset_phash(db, monkeypatch):
    groups = [{"groupId": 1, "name": "OP01"}]
    products = {"results": [_luffy_product()]}
    _install_fake_tcgcsv(monkeypatch, groups, _group_urls(1, products, _prices()))
    catalog_sync.sync_catalog(db)

    row = db.query(CatalogPrinting).filter_by(card_id="OP01-001", product_id=111).one()
    row.phash = "abcd1234abcd1234"
    row.phash_source = row.image_url
    db.commit()

    _install_fake_tcgcsv(
        monkeypatch, groups, _group_urls(1, products, _prices())
    )
    monkeypatch.setattr(
        catalog_sync,
        "_get_json",
        lambda client, url, _orig=catalog_sync._get_json: (
            {"results": [{"productId": 111, "subTypeName": "Normal", "marketPrice": 9.0, "lowPrice": 8.0}]}
            if url.endswith("/1/prices")
            else _orig(client, url)
        ),
    )
    catalog_sync.sync_catalog(db)

    row2 = db.query(CatalogPrinting).filter_by(card_id="OP01-001", product_id=111).one()
    assert row2.market_price == 9.0
    assert row2.phash == "abcd1234abcd1234"


def test_printing_dropped_upstream_is_removed(db, monkeypatch):
    groups = [{"groupId": 1, "name": "OP01"}]
    products = {"results": [_luffy_product(product_id=111), _luffy_product(product_id=222)]}
    prices = {
        "results": [
            {"productId": 111, "subTypeName": "Normal", "marketPrice": 5.0, "lowPrice": 4.0},
            {"productId": 222, "subTypeName": "Normal", "marketPrice": 6.0, "lowPrice": 5.0},
        ]
    }
    _install_fake_tcgcsv(monkeypatch, groups, _group_urls(1, products, prices))
    result = catalog_sync.sync_catalog(db)
    assert result["printing_count"] == 2

    products_after = {"results": [_luffy_product(product_id=111)]}
    _install_fake_tcgcsv(monkeypatch, groups, _group_urls(1, products_after, _prices()))
    result2 = catalog_sync.sync_catalog(db)
    assert result2["printing_count"] == 1

    remaining = db.query(CatalogPrinting).filter_by(card_id="OP01-001").all()
    assert [r.product_id for r in remaining] == [111]


def _perona_product(product_id: int) -> dict[str, Any]:
    return {
        "productId": product_id,
        "name": "Perona (Japanese Version 3rd Anniversary Set)",
        "imageUrl": f"https://tcgplayer.example/{product_id}.jpg",
        "url": f"https://tcgplayer.example/product/{product_id}",
        "extendedData": [
            {"name": "Number", "value": "OP12-034"},
            {"name": "Rarity", "value": "C"},
            {"name": "CardType", "value": "Character"},
        ],
    }


def test_sync_flags_unmarked_promo_only_when_its_product_is_on_the_alt_list_762(db, monkeypatch):
    listed, unlisted = 680491, 999999999
    groups = [{"groupId": 1, "name": "Promo"}]
    products = {"results": [_perona_product(listed), _perona_product(unlisted)]}
    prices = {
        "results": [
            {"productId": pid, "subTypeName": "Normal", "marketPrice": 3.0, "lowPrice": 2.0}
            for pid in (listed, unlisted)
        ]
    }
    _install_fake_tcgcsv(monkeypatch, groups, _group_urls(1, products, prices))

    catalog_sync.sync_catalog(db)

    flags = {
        r.product_id: r.is_special
        for r in db.query(CatalogPrinting).filter_by(card_id="OP12-034").all()
    }
    assert flags == {listed: 1, unlisted: 0}


def test_sync_keeps_listed_base_printing_primary_763(db, monkeypatch):
    base, prerelease, listed_alt = 486398, 486712, 680491
    prices_by_pid = {base: 0.25, prerelease: 63.96, listed_alt: 3.0}
    groups = [{"groupId": 1, "name": "Paramount War"}]
    products = {
        "results": [
            {**_perona_product(pid), "name": "Boa Hancock", "extendedData": [
                {"name": "Number", "value": "OP02-059"},
                {"name": "Rarity", "value": "C"},
                {"name": "CardType", "value": "Character"},
            ]}
            for pid in prices_by_pid
        ]
    }
    prices = {
        "results": [
            {"productId": pid, "subTypeName": "Normal", "marketPrice": price, "lowPrice": price}
            for pid, price in prices_by_pid.items()
        ]
    }
    _install_fake_tcgcsv(monkeypatch, groups, _group_urls(1, products, prices))

    catalog_sync.sync_catalog(db)

    flags = {
        r.product_id: r.is_special
        for r in db.query(CatalogPrinting).filter_by(card_id="OP02-059").all()
    }
    assert flags == {base: 0, prerelease: 0, listed_alt: 1}
    assert db.get(CatalogCard, "OP02-059").market_price == 0.25


def test_failed_group_keeps_its_existing_printings_1218(db, monkeypatch):
    groups = [{"groupId": 1, "name": "OP01"}, {"groupId": 2, "name": "OP02"}]
    op02 = {
        **_luffy_product(product_id=222),
        "extendedData": [
            {"name": "Number", "value": "OP02-001"},
            {"name": "Rarity", "value": "L"},
            {"name": "CardType", "value": "Leader"},
        ],
    }
    data = {
        **_group_urls(1, {"results": [_luffy_product()]}, _prices()),
        **_group_urls(2, {"results": [op02]}, _prices(222)),
    }
    _install_fake_tcgcsv(monkeypatch, groups, data)
    catalog_sync.sync_catalog(db)
    assert db.query(CatalogPrinting).count() == 2

    ok = catalog_sync._get_json

    def flaky(client, url):
        if url.startswith(f"{catalog_sync.TCGCSV_BASE}/2/"):
            raise httpx.ConnectError("boom")
        return ok(client, url)

    monkeypatch.setattr(catalog_sync, "_get_json", flaky)
    catalog_sync.sync_catalog(db)

    assert {r.product_id for r in db.query(CatalogPrinting).all()} == {111, 222}


def _response(status: int) -> httpx.Response:
    return httpx.Response(status, json={"results": []}, request=httpx.Request("GET", "https://x.test/a"))


class _SeqClient:
    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.calls = 0

    def get(self, url, **kwargs):  # noqa: ARG002
        self.calls += 1
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


def test_get_json_retries_503_then_succeeds_1218(monkeypatch):
    monkeypatch.setattr(catalog_sync, "_retry_wait", lambda *_: 0)
    client = _SeqClient([_response(503), _response(200)])
    assert catalog_sync._get_json(client, "https://x.test/a") == {"results": []}
    assert client.calls == 2


def test_get_json_does_not_retry_404_1218(monkeypatch):
    monkeypatch.setattr(catalog_sync, "_retry_wait", lambda *_: 0)
    client = _SeqClient([_response(404), _response(200)])
    with pytest.raises(httpx.HTTPStatusError):
        catalog_sync._get_json(client, "https://x.test/a")
    assert client.calls == 1


def test_get_json_gives_up_after_three_attempts_1218(monkeypatch):
    monkeypatch.setattr(catalog_sync, "_retry_wait", lambda *_: 0)
    client = _SeqClient([httpx.ConnectError("a"), httpx.ReadTimeout("b"), httpx.ConnectError("c"), _response(200)])
    with pytest.raises(httpx.ConnectError):
        catalog_sync._get_json(client, "https://x.test/a")
    assert client.calls == 3


def _many_products(count: int, start: int = 0) -> tuple[dict[str, Any], dict[str, Any]]:
    products, prices = [], []
    for n in range(start, start + count):
        product = _luffy_product(product_id=10_000 + n)
        product["extendedData"][0]["value"] = f"OP01-{n + 1:03d}"
        products.append(product)
        prices.append({"productId": 10_000 + n, "subTypeName": "Normal", "marketPrice": 1.0, "lowPrice": 1.0})
    return {"results": products}, {"results": prices}


def _selects_during(db, fn) -> int:
    from sqlalchemy import event

    db.expunge_all()

    seen: list[str] = []
    engine = db.get_bind()

    def count(conn, cursor, statement, params, context, executemany):  # noqa: ARG001
        if statement.lstrip().upper().startswith("SELECT"):
            seen.append(statement)

    event.listen(engine, "before_cursor_execute", count)
    try:
        fn()
    finally:
        event.remove(engine, "before_cursor_execute", count)
    return len(seen)


def test_sync_does_not_query_once_per_card_1346(db, monkeypatch):
    groups = [{"groupId": 1, "name": "OP01"}]

    def run(count: int) -> int:
        products, prices = _many_products(count)
        _install_fake_tcgcsv(monkeypatch, groups, _group_urls(1, products, prices))
        return _selects_during(db, lambda: catalog_sync.sync_catalog(db))

    few = run(3)
    many = run(40)
    assert many <= few + 4


def test_refresh_special_flags_does_not_query_once_per_card_1346(db):
    from tests.conftest import add_catalog

    def seed(count: int, offset: int) -> None:
        for n in range(offset, offset + count):
            add_catalog(db, f"OP02-{n + 1:03d}", name=f"Card {n}", product_id=20_000 + n, market=1.0)

    seed(3, 0)
    few = _selects_during(db, lambda: catalog_sync.refresh_special_flags(db))
    seed(40, 3)
    many = _selects_during(db, lambda: catalog_sync.refresh_special_flags(db))
    assert many <= few + 1


def test_sync_keeps_printings_when_upstream_would_wipe_a_large_share_1346(db, monkeypatch):
    groups = [{"groupId": 1, "name": "OP01"}]
    products, prices = _many_products(100)
    _install_fake_tcgcsv(monkeypatch, groups, _group_urls(1, products, prices))
    catalog_sync.sync_catalog(db)

    products, prices = _many_products(20)
    _install_fake_tcgcsv(monkeypatch, groups, _group_urls(1, products, prices))
    result = catalog_sync.sync_catalog(db)

    assert result["deletes_skipped"] is True
    assert db.query(CatalogPrinting).count() == 100
    meta = db.query(catalog_sync.CatalogMeta).one()
    assert "deletes skipped" in meta.notes


def test_sync_still_removes_a_small_share_of_printings_1346(db, monkeypatch):
    groups = [{"groupId": 1, "name": "OP01"}]
    products, prices = _many_products(100)
    _install_fake_tcgcsv(monkeypatch, groups, _group_urls(1, products, prices))
    catalog_sync.sync_catalog(db)

    products, prices = _many_products(95)
    _install_fake_tcgcsv(monkeypatch, groups, _group_urls(1, products, prices))
    result = catalog_sync.sync_catalog(db)

    assert result["deletes_skipped"] is False
    assert db.query(CatalogPrinting).count() == 95
