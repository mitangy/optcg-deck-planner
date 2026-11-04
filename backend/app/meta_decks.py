"""Meta deck browser (#443): leader shares and tournament decklists from the Limitless TCG events kept by tournament_sync.

Pure query/aggregation functions; the router adds rate limits and caching. Output never carries player data
(none is stored). Leader and card names are shown without the catalog's trailing id or collector number.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.catalog_sync import _orm_printing_sort_key
from app.models import CatalogCard, CatalogPrinting, Tournament, TournamentDeck

SOURCE = "Limitless TCG"
SOURCE_URL = "https://play.limitlesstcg.com/tournaments/completed?game=OP"
EVENT_URL = "https://play.limitlesstcg.com/tournament/{}"
TOP_FINISH = 8
CARD_LEADERS = 10
CARD_TOP_DECKS = 6

# "Rocks.D.Xebec (039)", "Name (OP14-020)", "Dracule Mihawk - OP14-020"
_NAME_SUFFIX_RE = re.compile(r"\s*(?:\(\s*(?:[A-Za-z]{1,4}\d{2}-)?\d{1,3}[A-Za-z]?\s*\)|-\s*[A-Za-z]{1,4}\d{2}-\d{3}[A-Za-z]?)\s*$")


def display_name(name: str | None) -> str:
    return _NAME_SUFFIX_RE.sub("", name or "").strip()


def _since(days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


def _window(db: Session, days: int, min_players: int) -> dict[str, Tournament]:
    q = select(Tournament).where(Tournament.date >= _since(days), Tournament.players >= min_players)
    return {e.id: e for e in db.scalars(q).all()}


def _catalog(db: Session, ids: set[str]) -> dict[str, CatalogCard]:
    if not ids:
        return {}
    return {c.card_id: c for c in db.scalars(select(CatalogCard).where(CatalogCard.card_id.in_(ids))).all()}


def _cost_key(card: dict) -> tuple[int, str]:
    try:
        return (int(card["cost"]), card["card_id"])
    except (TypeError, ValueError):
        return (99, card["card_id"])


def meta_leaders(db: Session, days: int, min_players: int) -> dict:
    events = _window(db, days, min_players)
    out = {
        "days": days,
        "min_players": min_players,
        "events": len(events),
        "total_decks": 0,
        "source": SOURCE,
        "source_url": SOURCE_URL,
        "leaders": [],
    }
    if not events:
        return out
    decks = db.scalars(select(TournamentDeck).where(TournamentDeck.tournament_id.in_(list(events)))).all()
    out["total_decks"] = len(decks)
    by_leader: dict[str, dict] = {}
    for d in decks:
        row = by_leader.setdefault(d.leader_id, {"decks": 0, "top8": 0, "wins": 0, "losses": 0, "ties": 0})
        row["decks"] += 1
        row["top8"] += 1 if d.placing is not None and d.placing <= TOP_FINISH else 0
        row["wins"] += d.wins
        row["losses"] += d.losses
        row["ties"] += d.ties
    catalog = _catalog(db, set(by_leader))
    leaders = []
    for lid, r in by_leader.items():
        card = catalog.get(lid)
        games = r["wins"] + r["losses"]
        leaders.append(
            {
                "leader_id": lid,
                "name": display_name(card.name) if card else "",
                "color": card.color if card else "",
                "image_url": card.image_url if card else "",
                "decks": r["decks"],
                "share": round(r["decks"] / len(decks), 3),
                "top8": r["top8"],
                "wins": r["wins"],
                "losses": r["losses"],
                "ties": r["ties"],
                "win_rate": round(r["wins"] / games, 3) if games else None,
            }
        )
    leaders.sort(key=lambda x: (-x["decks"], x["leader_id"]))
    out["leaders"] = leaders
    return out


def meta_decks(db: Session, leader_id: str, days: int, min_players: int, top: int, limit: int) -> dict:
    events = _window(db, days, min_players)
    leader = db.get(CatalogCard, leader_id)
    out = {
        "leader_id": leader_id,
        "name": display_name(leader.name) if leader else "",
        "image_url": leader.image_url if leader else "",
        "decks": [],
    }
    if not events:
        return out
    q = select(TournamentDeck).where(TournamentDeck.tournament_id.in_(list(events)), TournamentDeck.leader_id == leader_id)
    if top:
        q = q.where(TournamentDeck.placing.is_not(None), TournamentDeck.placing <= top)
    rows = []
    for d in db.scalars(q).all():
        counts = {cid: n for cid, n in json.loads(d.decklist or "{}").items() if cid != leader_id and n > 0}
        if counts:
            rows.append((d, counts))
    # Placing asc (unplaced last), then bigger events, then newest: three stable sorts, least significant first.
    rows.sort(key=lambda r: events[r[0].tournament_id].date, reverse=True)
    rows.sort(key=lambda r: events[r[0].tournament_id].players, reverse=True)
    rows.sort(key=lambda r: (r[0].placing is None, r[0].placing or 0))
    rows = rows[:limit]
    catalog = _catalog(db, {cid for _, counts in rows for cid in counts})
    for d, counts in rows:
        e = events[d.tournament_id]
        cards = []
        for cid, n in counts.items():
            c = catalog.get(cid)
            cards.append(
                {
                    "card_id": cid,
                    "count": n,
                    "name": display_name(c.name) if c else "",
                    "cost": (c.cost or "") if c else "",
                    "card_type": c.card_type if c else "",
                    "image_url": c.image_url if c else "",
                }
            )
        cards.sort(key=_cost_key)
        out["decks"].append(
            {
                "id": d.id,
                "event_id": e.id,
                "event": e.name,
                "event_url": EVENT_URL.format(e.id),
                "set_label": e.set_label,
                "date": e.date.date().isoformat(),
                "players": e.players,
                "placing": d.placing,
                "record": {"wins": d.wins, "losses": d.losses, "ties": d.ties},
                "cards": cards,
                "card_count": sum(c["count"] for c in cards),
                "text": "\n".join([f"1x{leader_id}", *(f"{c['count']}x{c['card_id']}" for c in cards)]),
            }
        )
    return out


def _copies(decklist: str | None) -> dict[str, int]:
    """{card id: copies} of one stored list; empty for a missing or "{}" list."""
    return {cid: n for cid, n in json.loads(decklist or "{}").items() if n > 0}


def _placing_order(rows: list[tuple[TournamentDeck, Tournament]]) -> None:
    """Placing asc (unplaced last), then bigger events, then newest: three stable sorts, least significant first."""
    rows.sort(key=lambda r: r[1].date, reverse=True)
    rows.sort(key=lambda r: r[1].players, reverse=True)
    rows.sort(key=lambda r: float("inf") if r[0].placing is None else r[0].placing)


def card_detail(db: Session, card_id: str, days: int, min_players: int) -> dict | None:
    """One card's page (#953): its printings and how much tournament play it sees. None when the catalog lacks it.

    A Leader's "decks_with_card" counts the decks it led (its meta share, over every deck like /meta/leaders). Any other
    card is measured over the decks that have a stored list: decks_with_card, copies, the leaders that play it and the
    best finishes with it.
    """
    card = db.get(CatalogCard, card_id)
    if card is None:
        return None
    is_leader = card.card_type == "Leader"
    printings = sorted(db.scalars(select(CatalogPrinting).where(CatalogPrinting.card_id == card_id)).all(), key=_orm_printing_sort_key)
    events = _window(db, days, min_players)
    decks = db.scalars(select(TournamentDeck).where(TournamentDeck.tournament_id.in_(list(events)))).all() if events else []
    lists = [(d, _copies(d.decklist)) for d in decks]
    lists = [(d, c) for d, c in lists if c]
    ran: list[tuple[TournamentDeck, int]]  # (deck, copies of this card)
    if is_leader:
        total = len(decks)
        ran = [(d, 1) for d in decks if d.leader_id == card_id]
        leaders: list[dict] = []
    else:
        total = len(lists)
        ran = [(d, c[card_id]) for d, c in lists if card_id in c]
        per_leader: dict[str, list[int]] = {}
        listed_by_leader: dict[str, int] = {}
        for d, c in lists:
            listed_by_leader[d.leader_id] = listed_by_leader.get(d.leader_id, 0) + 1
        for d, n in ran:
            per_leader.setdefault(d.leader_id, []).append(n)
        rows = sorted(per_leader.items(), key=lambda kv: (-len(kv[1]), kv[0]))[:CARD_LEADERS]
        names = _catalog(db, {lid for lid, _ in rows})
        leaders = []
        for lid, copies in rows:
            lc = names.get(lid)
            leaders.append(
                {
                    "leader_id": lid,
                    "name": display_name(lc.name) if lc else "",
                    "color": lc.color if lc else "",
                    "image_url": lc.image_url if lc else "",
                    "leader_decks": listed_by_leader[lid],
                    "decks_with_card": len(copies),
                    "rate": round(len(copies) / listed_by_leader[lid], 3),
                    "average_copies": round(sum(copies) / len(copies), 1),
                }
            )
    copies_of = {d.id: n for d, n in ran}
    order = [(d, events[d.tournament_id]) for d, _ in ran]
    _placing_order(order)
    top = order[:CARD_TOP_DECKS]
    led = _catalog(db, {d.leader_id for d, _ in top})
    top_decks = []
    for d, e in top:
        lc = led.get(d.leader_id)
        top_decks.append(
            {
                "id": d.id,
                "event": e.name,
                "event_url": EVENT_URL.format(e.id),
                "date": e.date.date().isoformat(),
                "players": e.players,
                "placing": d.placing,
                "record": {"wins": d.wins, "losses": d.losses, "ties": d.ties},
                "leader_id": d.leader_id,
                "leader_name": display_name(lc.name) if lc else "",
                "leader_image_url": lc.image_url if lc else "",
                "copies": copies_of[d.id],
            }
        )
    return {
        "card": {
            "card_id": card.card_id,
            "name": display_name(card.name),
            "rarity": card.rarity,
            "color": card.color,
            "card_type": card.card_type,
            "cost": card.cost,
            "group_name": card.group_name,
            "image_url": card.image_url,
            "tcgplayer_url": card.tcgplayer_url,
            "market_price": card.market_price,
        },
        "printings": [
            {
                "product_id": p.product_id,
                "name": p.name,
                "market_price": p.market_price,
                "image_url": p.image_url,
                "tcgplayer_url": p.tcgplayer_url,
                "group_name": p.group_name,
                "is_special": bool(p.is_special),
            }
            for p in printings
        ],
        "usage": {
            "days": days,
            "min_players": min_players,
            "events": len(events),
            "total_decks": total,
            "is_leader": is_leader,
            "decks_with_card": len(ran),
            "rate": round(len(ran) / total, 3) if total else 0.0,
            "average_copies": None if is_leader or not ran else round(sum(n for _, n in ran) / len(ran), 1),
            "leaders": leaders,
            "top_decks": top_decks,
            "source": SOURCE,
            "source_url": SOURCE_URL,
        },
    }
