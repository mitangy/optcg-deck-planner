from __future__ import annotations

from app.planner.catalog_search import search_catalog
from app.planner.models import CatalogCard, CatalogPrinting


def _seed(db):
    db.add_all(
        [
            CatalogCard(
                card_id="OP01-001", name="Zoro Blocker Fan", group_name="Set A", market_price=9.0,
                effect_text="Draw 1 card.", attribute="Slash", traits="Straw Hat Crew",
            ),
            CatalogCard(
                card_id="OP01-002", name="Sanji", group_name="Set A", market_price=0.5,
                effect_text="[Blocker] (After your opponent declares an attack, you may rest this card.)",
                attribute="Strike", traits="Straw Hat Crew / Baratie",
            ),
            CatalogCard(card_id="OP01-003", name="Nami", group_name="Set A", market_price=1.0),
            CatalogPrinting(card_id="OP01-002", product_id=21, name="Sanji", group_name="Set A", market_price=0.5, is_special=0),
            CatalogPrinting(card_id="OP01-002", product_id=22, name="Sanji (Parallel)", group_name="Set A", market_price=7.0, is_special=1),
        ]
    )
    db.commit()


def test_search_finds_a_card_by_its_effect_text_1471(db):
    _seed(db)
    assert {c.card_id for c in search_catalog(db, q="draw 1 card")} == {"OP01-001"}


def test_search_finds_a_card_by_its_attribute_1471(db):
    _seed(db)
    assert {c.card_id for c in search_catalog(db, q="Strike")} == {"OP01-002"}


def test_search_finds_cards_by_their_traits_1471(db):
    _seed(db)
    assert {c.card_id for c in search_catalog(db, q="Baratie")} == {"OP01-002"}


def test_name_match_ranks_above_a_text_only_match_1471(db):
    _seed(db)
    # Sanji is cheaper and only matches "Blocker" by effect text; Zoro matches by name.
    assert [c.card_id for c in search_catalog(db, q="Blocker")] == ["OP01-001", "OP01-002"]


def test_alt_rows_still_show_for_a_card_matched_by_effect_text_1471(db):
    _seed(db)
    rows = search_catalog(db, q="Baratie", alts=True)
    assert [(c.card_id, c.alt_product_id) for c in rows] == [("OP01-002", None), ("OP01-002", 22)]


def _seed_1475(db):
    # One expensive Leader and one expensive printing-name-only card, buried under
    # cheap cards that only match "Leader" / "Ace" through their effect text.
    rows = [
        CatalogCard(card_id="OP09-001", name="Shanks", group_name="Set B", card_type="Leader",
                    rarity="SR", color="Red", market_price=50.0, effect_text="Draw 1 card."),
        CatalogCard(card_id="OP09-002", name="Portgas", group_name="Set B", card_type="Character",
                    rarity="C", color="Green", market_price=40.0, effect_text="Draw 1 card."),
        CatalogPrinting(card_id="OP09-002", product_id=91, name="Portgas (Ace Deck)",
                        group_name="Set B", market_price=40.0, is_special=1),
    ]
    for i in range(3):
        rows.append(
            CatalogCard(card_id=f"OP09-01{i}", name=f"Filler {i}", group_name="Set B",
                        card_type="Character", rarity="C", color="Blue",
                        market_price=0.1 + i, effect_text="If your Leader is Red, play an SR Ace Deck card.")
        )
    db.add_all(rows)
    db.commit()


def test_type_and_rarity_matches_rank_above_effect_text_matches_1475(db):
    _seed_1475(db)
    for q in ("Leader", "SR", "Red"):  # card_type, rarity, color
        assert [c.card_id for c in search_catalog(db, q=q, limit=1)] == ["OP09-001"], q


def test_printing_name_match_ranks_above_effect_text_matches_1475(db):
    _seed_1475(db)
    assert [c.card_id for c in search_catalog(db, q="Ace Deck", limit=1)] == ["OP09-002"]
