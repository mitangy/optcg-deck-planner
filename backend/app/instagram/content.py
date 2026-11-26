"""What gets posted today (#1477): picks the kind by rotation and builds (caption, image, subject)."""

from __future__ import annotations

import asyncio
import io
import logging
import random
import re
from dataclasses import dataclass
from datetime import date

import httpx
from PIL import Image
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.instagram import captions, render
from app.instagram.models import InstagramPost
from app.planner import meta_decks
from app.planner.models import CatalogCard

log = logging.getLogger("uvicorn.error")

KINDS = ("meta_chart", "card_spotlight", "feature")
META_DAYS = 14
META_MIN_PLAYERS = 8
META_MIN_DECKS = 30
META_MIN_LEADERS = 5
META_BARS = 8
MAX_ART_BYTES = 5_000_000
SPOTLIGHT_RARITIES = ("L", "SR", "SEC", "R")
_CARD_RE = re.compile(r"^(OP|EB|ST)(\d{2})-\d{3}$")
_SET_RANK = {"OP": 3, "EB": 2, "ST": 1}

FEATURES: list[tuple[str, str, str]] = [
    ("bot", "Play a bot, any time", "No one to play? Jump into a game against the bot at three difficulty levels, right in your browser."),
    ("ranked", "Climb the ranked ladder", "Queue for ranked matches, earn rating each season and see where you stand on the leaderboard."),
    ("spectate", "Watch live games", "Spectate games as they happen, or jump in a friend's match to see how they pilot their deck."),
    ("replay", "Review your games with move grades", "Replay a finished game and see how each of your moves graded, so you can spot the turn that decided it."),
    ("planner", "Deck planner and shopping list", "Build decks, track what you own and get a shopping list with TCGPlayer prices for the cards you are missing."),
    ("logpose", "Ask Log Pose, the AI deck analyst", "Log Pose looks at your deck, finds cards and explains matchups using tournament data and bot simulations."),
    ("scanner", "Scan a stack of cards at once", "Point your phone at your binder or a pile of cards and the multi-card scanner adds them to your collection."),
    ("groupbuy", "Split a group buy with friends", "Order cards together, see what each person owes and track arrivals and hand-offs in one place."),
    ("practice", "Practice with undo", "Try a line, take it back and try another. Practice mode lets you undo moves while you learn a deck."),
    ("devices", "Phone and desktop", "Play and plan the same decks on your phone or your computer. Nothing to install."),
]


@dataclass
class Post:
    kind: str
    caption: str
    image: bytes
    subject: str


def kind_order(today: date) -> list[str]:
    """Meta chart on Mondays, otherwise card spotlight and feature tip alternate. A feature tip is always possible."""
    if today.weekday() == 0:
        order = ["meta_chart", "card_spotlight", "feature"]
    elif today.toordinal() % 2 == 0:
        order = ["card_spotlight", "feature"]
    else:
        order = ["feature", "card_spotlight"]
    return order


def _meta_post(db: Session, today: date) -> Post | None:
    data = meta_decks.meta_leaders(db, META_DAYS, META_MIN_PLAYERS)
    leaders = [x for x in data["leaders"] if x["name"]]
    if data["total_decks"] < META_MIN_DECKS or len(leaders) < META_MIN_LEADERS:
        return None
    top = leaders[:META_BARS]
    image = render.render_meta_chart([(x["name"], x["share"], x["color"]) for x in top], META_DAYS, data["source"])
    pct = lambda x: f"{x['share'] * 100:.1f}%"  # noqa: E731
    lines = [
        f"{top[0]['name']} leads the tournament meta at {pct(top[0])} of decks over the last {META_DAYS} days.",
        f"Next up: {top[1]['name']} {pct(top[1])} and {top[2]['name']} {pct(top[2])}.",
        f"Data: {data['source']}.",
    ]
    tags = [captions.tag(x["name"]) for x in top[:3]]
    iso = today.isocalendar()
    return Post("meta_chart", captions.build_caption(lines, tags), image, f"{iso.year}-W{iso.week:02d}")


def _set_key(card_id: str) -> tuple[int, int] | None:
    m = _CARD_RE.match(card_id)
    return (_SET_RANK[m.group(1)], int(m.group(2))) if m else None


def pick_card(db: Session, today: date) -> CatalogCard | None:
    """A card from the newest set that has one not featured before."""
    featured = set(db.scalars(select(InstagramPost.subject).where(InstagramPost.kind == "card_spotlight")).all())
    by_set: dict[tuple[int, int], list[CatalogCard]] = {}
    for card in db.scalars(select(CatalogCard).where(CatalogCard.image_url != "", CatalogCard.name != "")).all():
        key = _set_key(card.card_id)
        if key is not None and card.card_id not in featured and card.card_type.upper() != "DON!!":
            by_set.setdefault(key, []).append(card)
    for key in sorted(by_set, reverse=True):
        pool = sorted(by_set[key], key=lambda c: c.card_id)
        good = [c for c in pool if c.rarity in SPOTLIGHT_RARITIES] or pool
        return random.Random(today.toordinal()).choice(good)
    return None


async def fetch_art(http: httpx.AsyncClient, url: str) -> Image.Image | None:
    try:
        resp = await http.get(url, follow_redirects=True, timeout=15.0)
        resp.raise_for_status()
        if len(resp.content) > MAX_ART_BYTES:
            return None
        img = Image.open(io.BytesIO(resp.content))
        img.load()
        return img
    except (httpx.HTTPError, OSError, ValueError):
        log.warning("instagram: card art could not be fetched")
        return None


async def _spotlight_post(db: Session, today: date, http: httpx.AsyncClient) -> Post | None:
    card = pick_card(db, today)
    if card is None:
        return None
    from app.planner.meta_decks import display_name

    name = display_name(card.name) or card.name
    art = await fetch_art(http, card.image_url)
    image = await asyncio.to_thread(render.render_card_spotlight, name, card.card_id, card.color, card.card_type, art)
    set_code = card.card_id.split("-")[0]
    colors = [c for c in card.color.replace("/", " ").split() if c]
    lines = [
        f"Card spotlight: {name} ({card.card_id}).",
        f"{card.color} {card.card_type} from {set_code}.".replace("  ", " "),
        "Build it, then try it against the bot in the sim.",
    ]
    tags = [captions.tag(name), f"#{set_code}", *[captions.tag(c + " deck") for c in colors]]
    return Post("card_spotlight", captions.build_caption(lines, tags), image, card.card_id)


async def _feature_post(db: Session) -> Post:
    used = db.scalar(select(func.count()).select_from(InstagramPost).where(InstagramPost.kind == "feature")) or 0
    idx = used % len(FEATURES)
    key, title, body = FEATURES[idx]
    image = await asyncio.to_thread(render.render_feature, title, body, idx + 1, len(FEATURES))
    lines = [f"{title}.", body]
    return Post("feature", captions.build_caption(lines, ["#OPTCGsim", "#OnePieceCardGameSim"]), image, key)


async def build_post(db: Session, kind: str, today: date, http: httpx.AsyncClient) -> Post | None:
    """None when the kind has nothing to post today (too little meta data, every card featured)."""
    if kind == "meta_chart":
        return _meta_post(db, today)
    if kind == "card_spotlight":
        return await _spotlight_post(db, today, http)
    if kind == "feature":
        return await _feature_post(db)
    raise ValueError(f"unknown kind {kind}")


async def build_today(db: Session, today: date, http: httpx.AsyncClient) -> Post:
    for kind in kind_order(today):
        post = await build_post(db, kind, today, http)
        if post is not None:
            return post
    raise RuntimeError("no post could be built")  # unreachable: a feature tip always builds
