"""Alt-art name markers and startup flag refresh."""

from __future__ import annotations

from sqlalchemy import select

from app.catalog_sync import refresh_special_flags
from app.domain import is_special_printing
from app.models import CatalogCard, CatalogPrinting
from app.services import _alt_arts_map, _primary_product_ids


def test_classic_and_expanded_special_markers():
    assert is_special_printing("Nami (Alternate Art)")
    assert is_special_printing("Trafalgar Law (002) (Parallel)")
    assert is_special_printing("Monkey.D.Luffy (Manga)")
    assert is_special_printing("Smoker & Tashigi (SP)")
    assert is_special_printing("Inazuma (Full Art)")
    assert is_special_printing("Vista (TR)")
    assert is_special_printing("Cavendish (Box Topper)")
    assert is_special_printing("Arlong (Dash Pack)")
    assert is_special_printing("Killer (Pirate Foil)")
    assert is_special_printing("Marco (Jolly Roger Foil)")
    assert is_special_printing("Usopp - OP01-004 (Treasure Cup)")
    assert is_special_printing(
        "Donquixote Rosinante (Store Championship 2023 Participation Pack Vol.1)"
    )
    assert is_special_printing("Trafalgar Law (Online Regional 2023) [Finalist]")
    assert is_special_printing("Sanji (Online Regional 2023) [Participant]")
    assert is_special_printing(
        "Jinbe (Premium Card Collection -ONE PIECE FILM RED Edition-)"
    )
    assert is_special_printing(
        "Ryuma (Oda Stamped Signature) (Premium Card Collection -Best Selection Vol. 3-)"
    )


def test_same_art_reprints_are_not_special():
    assert not is_special_printing("Cavendish - EB01-012 (Reprint)")
    assert not is_special_printing("Tony Tony.Chopper (Reprint)")
    assert not is_special_printing("Buggy (Promo Reprint)")
    assert not is_special_printing("Nami")
    assert not is_special_printing("Cavendish")
    assert not is_special_printing("Gum-Gum Champion Rifle")
    assert not is_special_printing("Mad Treasure")
    assert not is_special_printing("Gum-Gum Dawn Stamp")
    assert not is_special_printing("Near Mint Foil")


def test_refresh_special_flags_promotes_new_markers_and_repicks_preferred(db):
    db.add(
        CatalogCard(
            card_id="OP01-008",
            name="Cavendish (Box Topper)",
            market_price=0.5,
            image_url="topper.png",
            group_name="Romance Dawn",
            is_special=0,
        )
    )
    db.add(
        CatalogPrinting(
            card_id="OP01-008",
            product_id=1,
            name="Cavendish",
            market_price=1.0,
            image_url="base.png",
            group_name="Romance Dawn",
            is_special=0,
        )
    )
    db.add(
        CatalogPrinting(
            card_id="OP01-008",
            product_id=2,
            name="Cavendish (Box Topper)",
            market_price=0.5,
            image_url="topper.png",
            group_name="Romance Dawn",
            is_special=0,  # stale flag from before marker expansion
        )
    )
    db.add(
        CatalogPrinting(
            card_id="ST30-002",
            product_id=3,
            name="Inazuma (Full Art)",
            market_price=4.0,
            image_url="fa.png",
            group_name="Starter Deck EX",
            is_special=0,
        )
    )
    db.add(
        CatalogCard(
            card_id="ST30-002",
            name="Inazuma (Full Art)",
            market_price=4.0,
            image_url="fa.png",
            group_name="Starter Deck EX",
            is_special=0,
        )
    )
    db.commit()

    result = refresh_special_flags(db)
    assert result["printings_updated"] >= 2

    topper = db.scalar(select(CatalogPrinting).where(CatalogPrinting.product_id == 2))
    full_art = db.scalar(select(CatalogPrinting).where(CatalogPrinting.product_id == 3))
    assert topper is not None and topper.is_special == 1
    assert full_art is not None and full_art.is_special == 1

    # Preferred catalog row should flip back to the non-special base art.
    card = db.get(CatalogCard, "OP01-008")
    assert card is not None
    assert card.name == "Cavendish"
    assert card.image_url == "base.png"
    assert card.is_special == 0


def test_alt_arts_map_excludes_preferred_and_same_image(db):
    db.add(
        CatalogCard(
            card_id="OP01-016",
            name="Nami",
            market_price=1.0,
            image_url="https://img.test/nami-base.jpg",
            group_name="Romance Dawn",
            is_special=0,
        )
    )
    db.add(
        CatalogPrinting(
            card_id="OP01-016",
            product_id=10,
            name="Nami",
            market_price=1.0,
            image_url="https://img.test/nami-base.jpg",
            group_name="Romance Dawn",
            is_special=0,
        )
    )
    # Same-art reprint SKU (even if incorrectly flagged special)
    db.add(
        CatalogPrinting(
            card_id="OP01-016",
            product_id=11,
            name="Nami (Reprint)",
            market_price=0.8,
            image_url="https://img.test/nami-base.jpg",
            group_name="Premium Booster",
            is_special=1,
        )
    )
    # True alt art
    db.add(
        CatalogPrinting(
            card_id="OP01-016",
            product_id=12,
            name="Nami (Alternate Art)",
            market_price=20.0,
            image_url="https://img.test/nami-aa.jpg",
            group_name="Romance Dawn",
            is_special=1,
        )
    )
    # SP-only card: preferred is the special itself — must not reappear as an alt
    db.add(
        CatalogCard(
            card_id="OP14-029",
            name="Tashigi (SP)",
            market_price=5.0,
            image_url="https://img.test/tashigi-sp.jpg",
            group_name="The Time of Battle",
            is_special=1,
        )
    )
    db.add(
        CatalogPrinting(
            card_id="OP14-029",
            product_id=20,
            name="Tashigi (SP)",
            market_price=5.0,
            image_url="https://img.test/tashigi-sp.jpg",
            group_name="The Time of Battle",
            is_special=1,
        )
    )
    db.commit()

    alts = _alt_arts_map(db, {"OP01-016", "OP14-029"})
    assert [a.product_id for a in alts.get("OP01-016", [])] == [12]
    assert "OP14-029" not in alts or alts["OP14-029"] == []


PERONA_NAME = "Perona (Japanese Version 3rd Anniversary Set)"
PERONA_ANNIVERSARY_PID = 680491  # on the shipped alt-art list, no name marker


def test_unmarked_promo_is_special_only_when_its_product_is_on_the_alt_list_762():
    assert is_special_printing(PERONA_NAME, PERONA_ANNIVERSARY_PID)
    assert not is_special_printing(PERONA_NAME, 999999999)
    assert not is_special_printing(PERONA_NAME)


def test_refresh_flags_unmarked_listed_promo_and_lists_it_as_alt_art_762(db):
    db.add(
        CatalogCard(
            card_id="OP12-034",
            name="Perona",
            market_price=0.5,
            image_url="https://img.test/perona-base.jpg",
            group_name="Legacy of the Master",
            is_special=0,
        )
    )
    db.add(
        CatalogPrinting(
            card_id="OP12-034",
            product_id=1,
            name="Perona",
            market_price=0.5,
            image_url="https://img.test/perona-base.jpg",
            group_name="Legacy of the Master",
            is_special=0,
        )
    )
    db.add(
        CatalogPrinting(
            card_id="OP12-034",
            product_id=PERONA_ANNIVERSARY_PID,
            name=PERONA_NAME,
            market_price=3.0,
            image_url="https://img.test/perona-anniv.jpg",
            group_name="Promo",
            is_special=0,  # stale: no name marker
        )
    )
    db.commit()

    refresh_special_flags(db)

    row = db.scalar(
        select(CatalogPrinting).where(CatalogPrinting.product_id == PERONA_ANNIVERSARY_PID)
    )
    assert row is not None and row.is_special == 1
    alts = _alt_arts_map(db, {"OP12-034"})
    assert [a.product_id for a in alts.get("OP12-034", [])] == [PERONA_ANNIVERSARY_PID]


BOA_BASE_PID = 486398  # real base printing, on the alt-art list, no name marker
BOA_PRERELEASE_PID = 486712  # duel-web's main art, not on the list, no name marker


def test_a_listed_promo_id_never_demotes_the_base_printing_763(db):
    def printing(pid, name, price, group):
        return CatalogPrinting(
            card_id="OP02-059",
            product_id=pid,
            name=name,
            market_price=price,
            image_url=f"https://img.test/{pid}.jpg",
            group_name=group,
            is_special=0,
        )

    db.add(CatalogCard(card_id="OP02-059", name="Boa Hancock", market_price=0.25, is_special=0))
    db.add(printing(BOA_BASE_PID, "Boa Hancock", 0.25, "Paramount War"))
    db.add(printing(BOA_PRERELEASE_PID, "Boa Hancock", 63.96, "Paramount War Pre-Release Cards"))
    db.add(printing(PERONA_ANNIVERSARY_PID, "Boa Hancock (Anniversary)", 3.0, "Promo"))
    db.commit()

    refresh_special_flags(db)

    flags = {r.product_id: r.is_special for r in db.scalars(select(CatalogPrinting)).all()}
    assert flags == {BOA_BASE_PID: 0, BOA_PRERELEASE_PID: 0, PERONA_ANNIVERSARY_PID: 1}
    card = db.get(CatalogCard, "OP02-059")
    assert card.market_price == 0.25 and card.group_name != "Paramount War Pre-Release Cards"
    assert _primary_product_ids(db, {"OP02-059"}) == {"OP02-059": BOA_BASE_PID}
    alts = _alt_arts_map(db, {"OP02-059"})
    assert [a.product_id for a in alts["OP02-059"]] == [PERONA_ANNIVERSARY_PID]
