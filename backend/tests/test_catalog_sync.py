"""sync_catalog's upsert behaviour: printing ids (and any phash) must survive
across syncs unless the printing's row is genuinely absent upstream."""

from __future__ import annotations

from typing import Any

from app import catalog_sync
from app.models import CatalogPrinting


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

    # Re-run against identical upstream data (a second nightly sync).
    result2 = catalog_sync.sync_catalog(db)
    assert result2["printing_count"] == 1

    row2 = db.query(CatalogPrinting).filter_by(card_id="OP01-001", product_id=111).one()
    assert row2.id == printing_id  # not a fresh row from delete-then-reinsert
    assert row2.phash == "abcd1234abcd1234"  # untouched by the resync
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

    # Upstream price moved, but the image (and so the hash) is unchanged.
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

    # TCGCSV stops listing product 222 on the next pull.
    products_after = {"results": [_luffy_product(product_id=111)]}
    _install_fake_tcgcsv(monkeypatch, groups, _group_urls(1, products_after, _prices()))
    result2 = catalog_sync.sync_catalog(db)
    assert result2["printing_count"] == 1

    remaining = db.query(CatalogPrinting).filter_by(card_id="OP01-001").all()
    assert [r.product_id for r in remaining] == [111]
