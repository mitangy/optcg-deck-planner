"""Meta deck browser (#443): leader shares and tournament decklists, public and cached."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import pytest

from app.analyst.models import Tournament, TournamentDeck
from app.planner.models import CatalogCard, CatalogPrinting
from app.core.rate_limit import RateLimiter
from app.routers import meta as meta_router
from tests.test_abuse_limits import _signed_in
from tests.test_duel import client  # noqa: F401  (fixture)

A, B, C, D = "OP01-001", "OP02-001", "OP09-001", "OP05-001"
LIST = {"OP01-016": 4}


@pytest.fixture(autouse=True)
def _fresh_meta_cache():
    meta_router.reset_cache()
    yield
    meta_router.reset_cache()


def ago(days: float) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


def add_event(db, eid: str, days: float, players: int, name: str = "Weekly Cup", set_label: str | None = None) -> None:
    db.add(Tournament(id=eid, name=name, date=ago(days), players=players, set_label=set_label, online=True, synced_at=ago(0)))


def add_deck(db, eid: str, leader: str, placing=None, record=(0, 0, 0), cards=None) -> int:
    d = TournamentDeck(
        tournament_id=eid,
        leader_id=leader,
        decklist=json.dumps(LIST if cards is None else cards),
        wins=record[0],
        losses=record[1],
        ties=record[2],
        placing=placing,
    )
    db.add(d)
    db.flush()
    return d.id


def add_card(db, cid: str, name: str, card_type="Character", cost: str | None = "1", color="Red", image="") -> None:
    db.add(CatalogCard(card_id=cid, name=name, card_type=card_type, cost=cost, color=color, image_url=image, rarity="L" if card_type == "Leader" else "C"))


def leaders(c, **params):
    r = c.get("/meta/leaders", params=params)
    assert r.status_code == 200, r.text
    return r.json()


def decks(c, leader, **params):
    r = c.get("/meta/decks", params={"leader": leader, **params})
    assert r.status_code == 200, r.text
    return r.json()


def test_window_and_min_players_pick_the_events_that_count_443(client):
    c, SessionLocal = client
    with SessionLocal() as db:
        add_event(db, "recent", 5, 32)
        add_event(db, "older", 20, 16)
        add_event(db, "tiny", 3, 4)
        add_event(db, "ancient", 60, 64)
        for eid in ("recent", "older", "tiny", "ancient"):
            add_deck(db, eid, A)
        db.commit()
    assert (leaders(c)["events"], leaders(c)["total_decks"]) == (2, 2)
    assert leaders(c, days=7)["events"] == 1
    assert leaders(c, days=90)["events"] == 3
    assert leaders(c, min_players=4)["events"] == 3
    assert leaders(c, min_players=17)["events"] == 1
    assert leaders(c, days=7, min_players=33) == {**leaders(c, days=7, min_players=33), "events": 0, "total_decks": 0, "leaders": []}
    # The deck list honours the same window.
    assert len(decks(c, A, days=7)["decks"]) == 1
    assert len(decks(c, A, min_players=4)["decks"]) == 3


def test_leaders_are_sorted_by_decks_then_id_with_their_share_443(client):
    c, SessionLocal = client
    with SessionLocal() as db:
        add_event(db, "e1", 2, 32)
        # B is inserted first, so only the id tie-break puts A ahead of it.
        for leader, n in ((B, 2), (A, 2), (C, 3), (D, 1)):
            for _ in range(n):
                add_deck(db, "e1", leader)
        add_deck(db, "e1", D, cards={})  # hidden list: still counts for the leader
        db.commit()
    out = leaders(c)
    assert [(x["leader_id"], x["decks"], x["share"]) for x in out["leaders"]] == [(C, 3, 0.333), (A, 2, 0.222), (B, 2, 0.222), (D, 2, 0.222)]
    assert out["total_decks"] == 9
    assert (out["source"], out["source_url"]) == ("Limitless TCG", "https://play.limitlesstcg.com/tournaments/completed?game=OP")


def test_leader_record_top8_and_win_rate_443(client):
    c, SessionLocal = client
    with SessionLocal() as db:
        add_event(db, "e1", 2, 32)
        add_event(db, "e2", 4, 32)
        add_deck(db, "e1", A, placing=8, record=(6, 2, 1))
        add_deck(db, "e2", A, placing=9, record=(3, 5, 2))
        add_deck(db, "e2", A, placing=None, record=(0, 0, 0))
        add_deck(db, "e1", B, placing=1, record=(0, 0, 3))
        db.commit()
    by_id = {x["leader_id"]: x for x in leaders(c)["leaders"]}
    assert {k: by_id[A][k] for k in ("decks", "top8", "wins", "losses", "ties", "win_rate")} == {"decks": 3, "top8": 1, "wins": 9, "losses": 7, "ties": 3, "win_rate": 0.562}
    # No decisive games: no win rate, not zero.
    assert (by_id[B]["win_rate"], by_id[B]["ties"], by_id[B]["top8"]) == (None, 3, 1)


def test_leader_and_card_names_drop_catalog_suffixes_443(client):
    c, SessionLocal = client
    with SessionLocal() as db:
        add_card(db, A, "Dracule Mihawk - OP01-001", "Leader", None, "Red", "https://img/a.png")
        add_card(db, B, "Rocks.D.Xebec (039)", "Leader")
        add_card(db, C, "Monkey.D.Luffy (Alt)", "Leader")
        add_card(db, "OP01-016", "Nami (OP01-016)")
        add_card(db, "OP01-017", "Zoro (Parallel)")
        add_event(db, "e1", 2, 32)
        for leader in (A, B, C):
            add_deck(db, "e1", leader, cards={"OP01-016": 2, "OP01-017": 2})
        db.commit()
    by_id = {x["leader_id"]: x for x in leaders(c)["leaders"]}
    assert [by_id[x]["name"] for x in (A, B, C)] == ["Dracule Mihawk", "Rocks.D.Xebec", "Monkey.D.Luffy (Alt)"]
    assert (by_id[A]["color"], by_id[A]["image_url"]) == ("Red", "https://img/a.png")
    out = decks(c, B)
    assert out["name"] == "Rocks.D.Xebec"
    assert [x["name"] for x in out["decks"][0]["cards"]] == ["Nami", "Zoro (Parallel)"]
    # A leader missing from the catalog still lists, with blanks.
    with SessionLocal() as db:
        add_event(db, "e2", 1, 32)
        add_deck(db, "e2", D)
        db.commit()
    meta_router.reset_cache()
    assert {x["leader_id"]: x["name"] for x in leaders(c)["leaders"]}[D] == ""


def test_decks_are_ordered_by_placing_then_players_then_date_443(client):
    c, SessionLocal = client
    with SessionLocal() as db:
        add_event(db, "big", 10, 64, "Big")
        add_event(db, "mid_new", 2, 32, "MidNew")
        add_event(db, "mid_old", 9, 32, "MidOld")
        add_event(db, "small", 1, 16, "Small")
        ids = {
            "unplaced_big": add_deck(db, "big", A, placing=None),
            "first_small": add_deck(db, "small", A, placing=1),
            "first_big": add_deck(db, "big", A, placing=1),
            "first_mid_old": add_deck(db, "mid_old", A, placing=1),
            "first_mid_new": add_deck(db, "mid_new", A, placing=1),
            "third": add_deck(db, "mid_new", A, placing=3),
        }
        db.commit()
    got = [d["id"] for d in decks(c, A)["decks"]]
    assert got == [ids[k] for k in ("first_big", "first_mid_new", "first_mid_old", "first_small", "third", "unplaced_big")]
    assert [d["id"] for d in decks(c, A, limit=2)["decks"]] == got[:2]


def test_top_filter_keeps_only_decks_placing_at_or_above_it_443(client):
    c, SessionLocal = client
    with SessionLocal() as db:
        add_event(db, "e1", 2, 32)
        for placing in (1, 2, 3, None):
            add_deck(db, "e1", A, placing=placing)
        db.commit()
    assert [d["placing"] for d in decks(c, A, top=2)["decks"]] == [1, 2]
    assert [d["placing"] for d in decks(c, A, top=0)["decks"]] == [1, 2, 3, None]


def test_decks_without_a_decklist_are_left_out_443(client):
    c, SessionLocal = client
    with SessionLocal() as db:
        add_event(db, "e1", 2, 32)
        add_deck(db, "e1", A, placing=1, cards={})
        shown = add_deck(db, "e1", A, placing=5)
        db.commit()
    assert [d["id"] for d in decks(c, A)["decks"]] == [shown]
    assert [d["id"] for d in decks(c, A, top=1)["decks"]] == []


def test_deck_rows_carry_event_record_and_sorted_cards_without_player_data_443(client):
    c, SessionLocal = client
    with SessionLocal() as db:
        add_card(db, A, "Silvers Rayleigh", "Leader", None, "Red", "https://img/leader.png")
        add_card(db, "OP01-016", "Nami", cost="1", image="https://img/nami.png")
        add_card(db, "OP01-020", "Cheap Event", "Event", cost="1")
        add_card(db, "OP01-009", "Big Boss", cost="10")
        add_card(db, "OP01-030", "Two Drop", cost="2")
        add_card(db, "OP01-040", "Missing Cost", cost=None)
        add_event(db, "abc", 2, 64, "Weekly Cup", "OP17")
        add_deck(db, "abc", A, placing=1, record=(6, 1, 2), cards={"OP01-040": 1, "OP01-009": 2, "OP01-030": 4, "OP01-020": 3, "OP01-016": 4, "OP01-999": 1})
        db.commit()
    out = decks(c, A)
    assert out["leader_id"] == A and out["name"] == "Silvers Rayleigh" and out["image_url"] == "https://img/leader.png"
    (deck,) = out["decks"]
    assert set(deck) == {"id", "event_id", "event", "event_url", "set_label", "date", "players", "placing", "record", "cards", "card_count", "text"}
    assert (deck["event_id"], deck["event"], deck["event_url"], deck["set_label"], deck["players"], deck["placing"]) == ("abc", "Weekly Cup", "https://play.limitlesstcg.com/tournament/abc", "OP17", 64, 1)
    assert deck["date"] == ago(2).date().isoformat()
    assert deck["record"] == {"wins": 6, "losses": 1, "ties": 2}
    # Cost ascending, card id within a cost; unknown cards (no catalog row) sort last.
    assert [(x["card_id"], x["count"]) for x in deck["cards"]] == [("OP01-016", 4), ("OP01-020", 3), ("OP01-030", 4), ("OP01-009", 2), ("OP01-040", 1), ("OP01-999", 1)]
    assert deck["cards"][0] == {"card_id": "OP01-016", "count": 4, "name": "Nami", "cost": "1", "card_type": "Character", "image_url": "https://img/nami.png"}
    assert deck["card_count"] == 15
    assert deck["text"] == "1xOP01-001\n4xOP01-016\n3xOP01-020\n4xOP01-030\n2xOP01-009\n1xOP01-040\n1xOP01-999"


def test_text_creates_a_planner_deck_with_that_leader_and_those_cards_443(client):
    c, SessionLocal = client
    ids = [f"OP01-{n:03d}" for n in range(10, 23)]
    counts = {cid: 4 for cid in ids[:12]} | {ids[12]: 2}
    assert sum(counts.values()) == 50
    with SessionLocal() as db:
        add_card(db, A, "Silvers Rayleigh", "Leader", None)
        for i, cid in enumerate(ids):
            add_card(db, cid, f"Card {i}", cost=str(i % 5))
        add_event(db, "e1", 2, 32)
        add_deck(db, "e1", A, placing=1, cards=counts)
        db.commit()
    (deck,) = decks(c, A)["decks"]
    c = _signed_in(c, SessionLocal)
    res = c.post("/decks", json={"name": "Silvers Rayleigh – 1st Weekly Cup", "decklist": deck["text"]})
    assert res.status_code == 200, res.text
    summary = res.json()
    assert (summary["leader_card_id"], summary["main_cards"]) == (A, 51)  # the planner counts the leader in the main deck: 1 + 50
    detail = c.get(f"/decks/{summary['id']}").json()
    got = {x["card_id"]: x["needed"] for x in detail["cards"]}
    assert got == {A: 1, **counts}


def test_meta_endpoints_need_no_login_443(client):
    c, _ = client
    assert not c.cookies
    assert c.get("/meta/leaders").status_code == 200
    assert c.get("/meta/decks", params={"leader": A}).status_code == 200
    assert c.get("/meta/decks", params={"leader": "nope"}).status_code == 422


def test_responses_are_cacheable_and_reused_for_ten_minutes_443(client, monkeypatch: pytest.MonkeyPatch):
    c, SessionLocal = client
    r = c.get("/meta/leaders")
    assert r.headers["cache-control"] == "public, max-age=600"
    assert c.get("/meta/decks", params={"leader": A}).headers["cache-control"] == "public, max-age=600"
    with SessionLocal() as db:
        add_event(db, "e1", 2, 32)
        add_deck(db, "e1", A)
        db.commit()
    assert c.get("/meta/leaders").json()["total_decks"] == 0  # served from the cache
    assert c.get("/meta/leaders", params={"days": 29}).json()["total_decks"] == 1  # other params, other entry
    # Past the TTL it is rebuilt.
    started = meta_router._now()
    monkeypatch.setattr(meta_router, "_now", lambda: started + meta_router.CACHE_TTL_S + 1)
    assert c.get("/meta/leaders").json()["total_decks"] == 1


def test_meta_requests_are_rate_limited_per_client_ip_443(client, monkeypatch: pytest.MonkeyPatch):
    c, _ = client
    monkeypatch.setattr(meta_router, "_rate_limiter", RateLimiter(max_calls=2, period_s=60))
    one, two = {"X-Forwarded-For": "192.0.2.1"}, {"X-Forwarded-For": "192.0.2.2"}
    assert [c.get("/meta/leaders", headers=one).status_code for _ in range(3)] == [200, 200, 429]
    assert c.get("/meta/decks", params={"leader": A}, headers=one).status_code == 429
    assert c.get("/meta/leaders", headers=two).status_code == 200


X = "OP01-016"


def card_page(c, card_id=X, **params):
    r = c.get(f"/meta/cards/{card_id}", params=params)
    assert r.status_code == 200, r.text
    return r.json()


def seed_card_meta(db) -> None:
    add_card(db, A, "Roronoa Zoro (OP01-001)", card_type="Leader", color="Red")
    add_card(db, B, "Eustass Kid", card_type="Leader", color="Red")
    add_card(db, X, "Nami (016)", color="Red")
    add_event(db, "e1", 5, 32)
    add_deck(db, "e1", A, cards={X: 4, "OP01-017": 2})
    add_deck(db, "e1", A, cards={"OP01-017": 4})
    add_deck(db, "e1", B, cards={X: 3})
    add_deck(db, "e1", B, cards={X: 1})
    add_deck(db, "e1", B, cards={"OP01-017": 1})
    add_deck(db, "e1", B, cards={})  # no stored list: not a decklist
    db.commit()


def test_card_usage_rate_and_average_copies_count_decks_with_a_list_953(client):
    c, SessionLocal = client
    with SessionLocal() as db:
        seed_card_meta(db)
    u = card_page(c)["usage"]
    assert (u["events"], u["total_decks"], u["decks_with_card"]) == (1, 5, 3)
    assert u["rate"] == 0.6
    assert u["average_copies"] == 2.7  # (4 + 3 + 1) / 3, not the max
    assert u["is_leader"] is False


def test_card_usage_breaks_down_by_leader_with_each_leaders_own_rate_953(client):
    c, SessionLocal = client
    with SessionLocal() as db:
        seed_card_meta(db)
    leaders_ = card_page(c)["usage"]["leaders"]
    assert [row["leader_id"] for row in leaders_] == [B, A]  # most decks with the card first, not by id
    kid, zoro = leaders_
    assert (kid["decks_with_card"], kid["leader_decks"], kid["rate"], kid["average_copies"]) == (2, 3, 0.667, 2.0)
    assert (zoro["decks_with_card"], zoro["leader_decks"], zoro["rate"], zoro["average_copies"]) == (1, 2, 0.5, 4.0)
    assert zoro["name"] == "Roronoa Zoro"  # catalog suffix dropped


def test_leader_card_usage_is_the_decks_it_led_with_no_leader_breakdown_953(client):
    c, SessionLocal = client
    with SessionLocal() as db:
        seed_card_meta(db)
    u = card_page(c, A)["usage"]
    assert u["is_leader"] is True
    assert (u["total_decks"], u["decks_with_card"], u["rate"]) == (6, 2, 0.333)  # every deck counts, like /meta/leaders
    assert u["average_copies"] is None
    assert u["leaders"] == []
    assert [d["leader_id"] for d in u["top_decks"]] == [A, A]


def test_card_pages_are_cached_per_card_and_window_953(client):
    c, SessionLocal = client
    with SessionLocal() as db:
        seed_card_meta(db)
    first = c.get(f"/meta/cards/{X}")
    assert first.headers["cache-control"] == "public, max-age=600"
    assert card_page(c, A)["card"]["card_id"] == A
    assert card_page(c)["card"]["card_id"] == X
    assert card_page(c, days=7)["usage"]["days"] == 7


def test_card_top_decks_order_by_placing_then_event_size_then_date_and_cap_at_six_953(client):
    c, SessionLocal = client
    with SessionLocal() as db:
        add_card(db, A, "Zoro", card_type="Leader")
        add_card(db, X, "Nami")
        add_event(db, "big", 10, 64, name="Big Open")
        add_event(db, "small", 3, 16, name="Small Cup")
        add_event(db, "old", 20, 16, name="Old Cup")
        ids = {
            "unplaced": add_deck(db, "big", A, cards={X: 1}),
            "third": add_deck(db, "small", A, placing=3, cards={X: 2}),
            "first_old": add_deck(db, "old", A, placing=1, cards={X: 3}),
            "first_small": add_deck(db, "small", A, placing=1, cards={X: 4}),
            "first_big": add_deck(db, "big", A, placing=1, cards={X: 1}),
            "second": add_deck(db, "big", A, placing=2, cards={X: 2}),
            "eighth": add_deck(db, "big", A, placing=8, cards={X: 2}),
        }
        db.commit()
    top = card_page(c)["usage"]["top_decks"]
    assert [d["id"] for d in top] == [ids[k] for k in ("first_big", "first_small", "first_old", "second", "third", "eighth")]
    assert [d["copies"] for d in top][:3] == [1, 4, 3]
    assert top[0]["event_url"] == "https://play.limitlesstcg.com/tournament/big"
    assert top[0]["leader_name"] == "Zoro"


def test_card_usage_ignores_events_outside_the_window_and_small_events_953(client):
    c, SessionLocal = client
    with SessionLocal() as db:
        add_card(db, X, "Nami")
        add_event(db, "recent", 5, 32)
        add_event(db, "ancient", 60, 64)
        add_event(db, "tiny", 2, 4)
        for eid in ("recent", "ancient", "tiny"):
            add_deck(db, eid, A, cards={X: 4})
        db.commit()
    assert card_page(c)["usage"]["decks_with_card"] == 1
    assert card_page(c, days=90)["usage"]["decks_with_card"] == 2
    assert card_page(c, min_players=2)["usage"]["decks_with_card"] == 2


def test_card_page_lists_printings_base_first_and_a_card_nobody_plays_953(client):
    c, SessionLocal = client
    with SessionLocal() as db:
        add_card(db, X, "Nami (016)")
        db.add_all(
            [
                CatalogPrinting(card_id=X, product_id=30, name="Nami (Alternate Art)", market_price=9.5, is_special=1, image_url="alt"),
                CatalogPrinting(card_id=X, product_id=20, name="Nami", market_price=0.4, is_special=0, image_url="base"),
                CatalogPrinting(card_id=X, product_id=40, name="Nami (Manga)", market_price=80.0, is_special=1),
            ]
        )
        db.commit()
    body = card_page(c)
    assert [p["product_id"] for p in body["printings"]] == [20, 30, 40]
    assert body["printings"][0]["image_url"] == "base" and body["printings"][1]["is_special"] is True
    assert body["card"]["name"] == "Nami"
    assert body["usage"]["decks_with_card"] == 0 and body["usage"]["rate"] == 0.0 and body["usage"]["average_copies"] is None
    assert body["usage"]["top_decks"] == [] and body["usage"]["leaders"] == []


def test_card_page_is_404_for_a_card_not_in_the_catalog_and_422_for_a_bad_id_953(client):
    c, _ = client
    assert c.get(f"/meta/cards/{X}").status_code == 404
    assert c.get("/meta/cards/nope").status_code == 422
    assert c.get(f"/meta/cards/{X}", params={"days": 91}).status_code == 422
