from __future__ import annotations

import asyncio
import functools
from datetime import date, datetime, timedelta, timezone

import httpx

from app.analyst.models import Tournament, TournamentDeck
from app.instagram import captions, content
from app.instagram.models import InstagramPost
from app.planner.models import CatalogCard


def aio(fn):
    """Run an async test body (no async pytest plugin is installed)."""

    @functools.wraps(fn)
    def run_it(*args, **kwargs):
        return asyncio.run(fn(*args, **kwargs))

    return run_it

DAY = date(2026, 11, 25)


def card(db, card_id: str, name="Card", rarity="SR", image="https://img.example/x.jpg") -> None:
    db.add(CatalogCard(card_id=card_id, name=name, rarity=rarity, color="Red", card_type="Character", image_url=image))
    db.commit()


def featured(db, card_id: str, day: date) -> None:
    db.add(
        InstagramPost(kind="card_spotlight", slot_date=day, caption="c", image_jpeg=b"x", media_token="t" + card_id, subject=card_id)
    )
    db.commit()


def test_caption_has_disclaimer_first_at_most_25_unique_hashtags_under_2200_chars_1477():
    extra = ["#OPTCG", "#optcg", "#Luffy", *[f"#Tag{i}" for i in range(60)]]
    text = captions.build_caption(["one", "two", "three", "four", "five dropped"], extra)
    lines = text.split("\n")
    assert lines[0] == "Unofficial fan-made OPTCG sim, not affiliated with Bandai."
    assert lines[-2] == "" and lines[-3].startswith("Play free: optcgduel.app")
    tags = lines[-1].split()
    assert len(tags) == 25
    assert len({t.lower() for t in tags}) == 25
    assert "five dropped" not in text and "four" in text
    assert len(text) < 2200


def test_caption_is_cut_to_fit_under_2200_chars_1477():
    text = captions.build_caption(["x" * 700, "y" * 700, "z" * 700], ["#" + "a" * 30 + str(i) for i in range(10)])
    assert len(text) < 2200


def test_leader_names_become_clean_hashtags_1477():
    assert captions.tag("Monkey.D.Luffy") == "#MonkeyDLuffy"
    assert captions.tag("Charlotte Katakuri (OP03)") == "#CharlotteKatakuriOP03"
    assert captions.tag("...") == ""


def test_spotlight_skips_cards_already_featured_and_stays_in_the_newest_set_1477(db):
    for cid in ("OP16-001", "OP16-002", "OP15-010"):
        card(db, cid)
    featured(db, "OP16-001", DAY - timedelta(days=2))
    assert content.pick_card(db, DAY).card_id == "OP16-002"
    featured(db, "OP16-002", DAY - timedelta(days=1))
    assert content.pick_card(db, DAY).card_id == "OP15-010"
    featured(db, "OP15-010", DAY)
    assert content.pick_card(db, DAY) is None


def test_spotlight_prefers_numbered_op_sets_over_starter_decks_and_ignores_promos_1477(db):
    for cid in ("ST29-001", "EB04-001", "P-001", "OP09-001", "OP16-001"):
        card(db, cid)
    assert content.pick_card(db, DAY).card_id == "OP16-001"
    featured(db, "OP16-001", DAY - timedelta(days=1))
    assert content.pick_card(db, DAY).card_id == "OP09-001"
    featured(db, "OP09-001", DAY)
    assert content.pick_card(db, DAY).card_id == "EB04-001"


@aio
async def test_spotlight_without_reachable_art_still_renders_a_text_card_1477(db):
    card(db, "OP16-001", name="Nami")
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(404))) as http:
        post = await content.build_post(db, "card_spotlight", DAY, http)
    assert post.subject == "OP16-001" and post.image[:2] == b"\xff\xd8"
    assert "Nami" in post.caption and "#OP16" in post.caption


def meta_data(db, leaders: int, decks_each: int) -> None:
    db.add(Tournament(id="t1", name="T", date=datetime.now(timezone.utc) - timedelta(days=2), players=64, synced_at=datetime.now(timezone.utc)))
    for i in range(leaders):
        db.add(CatalogCard(card_id=f"OP01-{i:03d}", name=f"Leader {i}", color="Red", card_type="Leader", image_url="x"))
        for _ in range(decks_each):
            db.add(TournamentDeck(tournament_id="t1", leader_id=f"OP01-{i:03d}", wins=3, losses=1))
    db.commit()


def test_meta_chart_needs_enough_decks_and_leaders_1477(db):
    meta_data(db, leaders=5, decks_each=2)  # 10 decks
    assert content._meta_post(db, DAY) is None


def test_meta_chart_needs_enough_leaders_1477(db):
    meta_data(db, leaders=3, decks_each=12)  # 36 decks, 3 leaders
    assert content._meta_post(db, DAY) is None


def test_meta_chart_post_names_the_top_leader_and_cites_limitless_1477(db):
    meta_data(db, leaders=6, decks_each=6)
    post = content._meta_post(db, DAY)
    assert post.kind == "meta_chart" and post.subject == "2026-W48"
    assert "Leader 0 leads the tournament meta at 16.7%" in post.caption and "Limitless TCG" in post.caption


def test_meta_chart_is_the_monday_post_and_every_day_can_fall_back_to_a_feature_tip_1477():
    assert content.kind_order(date(2026, 11, 23))[0] == "meta_chart"
    assert content.kind_order(date(2026, 11, 24))[0] != "meta_chart"
    assert all("feature" in content.kind_order(date(2026, 11, 23 + i)) for i in range(7))


@aio
async def test_feature_tips_rotate_through_the_list_1477(db):
    async with httpx.AsyncClient() as http:
        first = await content.build_post(db, "feature", DAY, http)
        db.add(InstagramPost(kind="feature", slot_date=DAY, caption="c", image_jpeg=b"x", media_token="a", subject=first.subject))
        db.commit()
        second = await content.build_post(db, "feature", DAY, http)
    assert first.subject != second.subject


THUMB = "https://tcgplayer-cdn.tcgplayer.com/product/712891_200w.jpg"


def test_tcgplayer_thumbnail_maps_to_full_size_then_400w_then_original_1486():
    assert content.art_urls(THUMB) == [
        "https://tcgplayer-cdn.tcgplayer.com/product/712891_in_1000x1000.jpg",
        "https://tcgplayer-cdn.tcgplayer.com/product/712891_400w.jpg",
        THUMB,
    ]
    assert content.art_urls("https://img.example/x.jpg") == ["https://img.example/x.jpg"]


def _png(size: tuple[int, int]) -> bytes:
    import io

    from PIL import Image

    out = io.BytesIO()
    Image.new("RGB", size, (200, 30, 30)).save(out, "PNG")
    return out.getvalue()


@aio
async def test_art_fetch_falls_back_down_the_variants_and_skips_non_images_1486():
    seen: list[str] = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req.url.path)
        if "in_1000x1000" in req.url.path:
            return httpx.Response(200, content=b"<html>not an image</html>")
        if "400w" in req.url.path:
            return httpx.Response(404)
        return httpx.Response(200, content=_png((200, 280)))

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        art = await content.fetch_best_art(http, THUMB)
    assert art is not None and art.size == (200, 280)
    assert seen == ["/product/712891_in_1000x1000.jpg", "/product/712891_400w.jpg", "/product/712891_200w.jpg"]


@aio
async def test_art_fetch_stops_at_the_full_size_variant_when_it_works_1486():
    seen: list[str] = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req.url.path)
        return httpx.Response(200, content=_png((600, 838)))

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        art = await content.fetch_best_art(http, THUMB)
    assert art is not None and art.size == (600, 838)
    assert seen == ["/product/712891_in_1000x1000.jpg"]


@aio
async def test_spotlight_caption_carries_the_cleaned_effect_text_after_the_title_line_1486(db):
    card(db, "OP16-001", name="Nami")
    row = db.get(CatalogCard, "OP16-001")
    row.effect_text = "[On Play]  Draw 1 card.\n\n  Then   trash 1 card."
    db.commit()
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(404))) as http:
        post = await content.build_post(db, "card_spotlight", DAY, http)
    lines = post.caption.split("\n")
    i = next(n for n, ln in enumerate(lines) if ln.startswith("Card spotlight:"))
    assert lines[i + 1] == "Effect: [On Play] Draw 1 card. Then trash 1 card."
    assert len(post.caption) <= captions.MAX_CAPTION and "Build it" in post.caption


@aio
async def test_spotlight_caption_has_no_effect_line_when_effect_text_is_empty_1486(db):
    card(db, "OP16-001", name="Nami")
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(404))) as http:
        post = await content.build_post(db, "card_spotlight", DAY, http)
    assert "Effect:" not in post.caption and "Build it" in post.caption


def test_long_effect_text_is_cut_at_a_word_and_the_caption_stays_under_the_limit_1486():
    line = content.effect_line("word " * 1000)
    assert line.endswith("...") and len(line) < 620
    caption = captions.build_caption(["Card spotlight: X (OP01-001).", line, "Red Character from OP01.", "Build it."], ["#X"])
    assert len(caption) <= captions.MAX_CAPTION and "Build it." in caption
