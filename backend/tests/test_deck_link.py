"""Duel saved decks and planner decks stay in sync, both ways (#1017)."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import inspect, select, text
from sqlalchemy.orm import sessionmaker

from app import db as app_db
from app import deck_link
from app.auth import SESSION_COOKIE, create_session_token
from app.config import get_settings
from app.db import get_db
from app.main import app
from app.models import CatalogCard, Deck, DeckCard, DeckCardPrinting, DuelSavedDeck, User
from app.routers import duel_decks
from tests.db_support import make_bare_engine, make_test_engine

LEADER = "OP01-001"
OTHER_LEADER = "OP02-001"


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret")
    monkeypatch.setenv("FRONTEND_ORIGIN", "http://localhost:5173")
    monkeypatch.setenv("DATABASE_URL", "sqlite://")
    get_settings.cache_clear()
    engine = make_test_engine()
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def _override_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    with SessionLocal() as db:
        for cid, name, kind, rarity in [
            (LEADER, "Luffy", "Leader", "L"),
            (OTHER_LEADER, "Zoro", "Leader", "L"),
            ("OP01-016", "Nami", "Character", "R"),
            ("OP01-017", "Zoro", "Character", "R"),
            ("OP01-018", "Sanji", "Character", "R"),
            ("DON-001", "DON!!", "DON!!", "DON!!"),
        ]:
            db.add(CatalogCard(card_id=cid, name=name, card_type=kind, rarity=rarity))
        db.commit()

    app.dependency_overrides[get_db] = _override_db
    with TestClient(app) as c:
        yield c, SessionLocal
    app.dependency_overrides.clear()
    get_settings.cache_clear()


def _user(S, name: str = "luffy") -> int:
    with S() as db:
        u = User(email=f"{name}@x.test", name=name, google_sub=f"sub-{name}")
        db.add(u)
        db.commit()
        return u.id


def _as(c: TestClient, uid: int) -> TestClient:
    c.cookies.set(SESSION_COOKIE, create_session_token(uid, 0))
    return c


def _duel(name="Red", leader=LEADER, cards=None, **extra) -> dict:
    return {"name": name, "leaderId": leader, "cards": cards or ["OP01-016"] * 4, **extra}


def _put(c, deck_id, at, deck=None):
    return c.put(f"/duel/decks/{deck_id}", json={"deck": deck or _duel(), "updatedAt": at})


def _planner_cards(S, deck_id: int) -> dict[str, int]:
    with S() as db:
        rows = db.scalars(select(DeckCard).where(DeckCard.deck_id == deck_id)).all()
        return {r.card_id: r.needed for r in rows}


def _planner_decks(S, uid: int) -> list[Deck]:
    with S() as db:
        return list(db.scalars(select(Deck).where(Deck.user_id == uid).order_by(Deck.id)).all())


def _duel_rows(S, uid: int) -> list[DuelSavedDeck]:
    with S() as db:
        return list(db.scalars(select(DuelSavedDeck).where(DuelSavedDeck.user_id == uid).order_by(DuelSavedDeck.id)).all())


def _full(extra: str = "OP01-016", leader: str = LEADER) -> str:
    """A complete planner decklist: the leader and exactly 50 main cards."""
    return f"1x{leader}\n50x {extra}"


def _new_planner(c, name, list_text) -> int:
    res = c.post("/decks", json={"name": name, "decklist": list_text})
    assert res.status_code == 200, res.text
    return res.json()["id"]


def test_duel_save_creates_and_links_a_planner_deck_1017(client):
    c, S = client
    uid = _user(S)
    res = _put(_as(c, uid), "d1", 1000, _duel("Red", editedLocally=True)).json()
    decks = _planner_decks(S, uid)
    assert [(d.name, d.leader_card_id, d.is_main) for d in decks] == [("Red", LEADER, True)]
    assert _planner_cards(S, decks[0].id) == {LEADER: 1, "OP01-016": 4}
    # The response is newer than what was sent and names the link, so the client adopts it.
    assert res["updatedAt"] == 1001
    assert res["deck"]["plannerDeckId"] == decks[0].id
    assert res["deck"]["editedLocally"] is None
    assert _duel_rows(S, uid)[0].planner_deck_id == decks[0].id


def test_duel_edit_updates_the_planner_deck_and_keeps_its_don_cards_1017(client):
    c, S = client
    uid = _user(S)
    _put(_as(c, uid), "d1", 1000)
    pid = _planner_decks(S, uid)[0].id
    with S() as db:
        db.add(DeckCard(deck_id=pid, card_id="DON-001", needed=10))
        db.add(DeckCardPrinting(deck_id=pid, card_id="OP01-016", product_id=77, qty=3))
        db.add(DeckCardPrinting(deck_id=pid, card_id="OP01-017", product_id=78, qty=1))
        db.add(DeckCard(deck_id=pid, card_id="OP01-017", needed=1))
        db.commit()
    edited = _duel("Renamed", cards=["OP01-016"] * 2 + ["OP01-018"] * 3, plannerDeckId=pid)
    assert _put(c, "d1", 2000, edited).status_code == 200
    assert _planner_cards(S, pid) == {LEADER: 1, "OP01-016": 2, "OP01-018": 3, "DON-001": 10}
    with S() as db:
        assert db.get(Deck, pid).name == "Renamed"
        left = db.scalars(select(DeckCardPrinting).where(DeckCardPrinting.deck_id == pid)).all()
        assert [(p.card_id, p.qty) for p in left] == [("OP01-016", 2)]  # clamped; removed card's gone
    assert len(_planner_decks(S, uid)) == 1


def test_changing_the_duel_leader_moves_the_planner_deck_and_its_main_flag_1017(client):
    c, S = client
    uid = _user(S)
    _put(_as(c, uid), "d1", 1000)
    _put(c, "d2", 1000, _duel("Second", cards=["OP01-017"] * 4))
    assert [d.is_main for d in _planner_decks(S, uid)] == [True, False]
    _put(c, "d1", 2000, _duel("Red", leader=OTHER_LEADER, plannerDeckId=_planner_decks(S, uid)[0].id))
    first, second = _planner_decks(S, uid)
    assert (first.leader_card_id, first.is_main) == (OTHER_LEADER, True)
    assert second.is_main is True


def test_planner_edits_update_the_duel_deck_1017(client):
    c, S = client
    uid = _user(S)
    pid = _new_planner(_as(c, uid), "Blue", f"1x{LEADER}\n50x OP01-016\n1x DON-001")
    row = _duel_rows(S, uid)[0]
    assert row.deck_id == f"planner-{pid}" and row.planner_deck_id == pid
    body = json.loads(row.data)
    # The duel deck holds the main deck only: no leader copy, no DON!!.
    assert (body["name"], body["leaderId"], body["cards"]) == ("Blue", LEADER, ["OP01-016"] * 50)
    assert body["plannerDeckId"] == pid
    before = row.updated_at_ms

    assert c.put(f"/decks/{pid}/cards/OP01-016", json={"needed": 48}).status_code == 200
    assert c.put(f"/decks/{pid}/cards/OP01-017", json={"needed": 2}).status_code == 200
    assert c.patch(f"/decks/{pid}", json={"name": "Blue v2"}).status_code == 200
    out = c.get("/duel/decks").json()["decks"][0]
    assert out["deck"]["name"] == "Blue v2"
    assert out["deck"]["cards"] == ["OP01-016"] * 48 + ["OP01-017"] * 2
    assert out["updatedAt"] > before

    assert c.delete(f"/decks/{pid}/cards/OP01-016").status_code == 200
    assert c.get("/duel/decks").json()["decks"][0]["deck"]["cards"] == ["OP01-017"] * 2


def test_planner_edit_keeps_duel_art_and_clears_the_local_edit_flag_1017(client):
    c, S = client
    uid = _user(S)
    _put(_as(c, uid), "d1", 1000, _duel(artPrefs={"OP01-016": "p1"}, plannerArt={"OP01-016": "p1"}))
    pid = _planner_decks(S, uid)[0].id
    with S() as db:  # a copy saved by an older client still carries the flag
        row = db.scalar(select(DuelSavedDeck))
        row.data = json.dumps({**json.loads(row.data), "editedLocally": True})
        db.commit()
    c.patch(f"/decks/{pid}", json={"name": "New name"})
    deck = c.get("/duel/decks").json()["decks"][0]["deck"]
    assert deck["name"] == "New name"
    assert (deck["artPrefs"], deck["plannerArt"]) == ({"OP01-016": "p1"}, {"OP01-016": "p1"})
    assert deck["editedLocally"] is None


def test_a_planner_deck_without_a_leader_is_mirrored_once_it_has_one_1017(client):
    c, S = client
    uid = _user(S)
    pid = _new_planner(_as(c, uid), "Pile", "50x OP01-016")
    assert _duel_rows(S, uid) == []
    c.put(f"/decks/{pid}/cards/{LEADER}", json={"needed": 1})
    rows = _duel_rows(S, uid)
    assert [json.loads(r.data)["cards"] for r in rows] == [["OP01-016"] * 50]


def test_cloning_a_deck_creates_a_second_linked_duel_deck_1017(client):
    c, S = client
    uid = _user(S)
    pid = _new_planner(_as(c, uid), "Blue", _full())
    with S() as db:
        from app.services import clone_deck

        user = db.get(User, uid)
        copy = clone_deck(db, user, db.get(Deck, pid), "Blue copy")
        copy_id = copy.id
    names = {json.loads(r.data)["name"]: r.planner_deck_id for r in _duel_rows(S, uid)}
    assert names == {"Blue": pid, "Blue copy": copy_id}


def test_identical_decks_on_both_sides_are_linked_not_duplicated_1017(client):
    c, S = client
    uid = _user(S)
    with S() as db:  # a planner deck and a duel deck that predate the link
        user = db.get(User, uid)
        from app.services import create_deck

        create_deck(db, user, "Planner name", f"1x{LEADER}\n4x OP01-016\n2x OP01-017")
        db.query(DuelSavedDeck).delete()
        db.add(
            DuelSavedDeck(
                user_id=uid,
                deck_id="d1",
                data=json.dumps(_duel("Duel name", cards=["OP01-017"] * 2 + ["OP01-016"] * 4)),
                updated_at_ms=500,
            )
        )
        db.commit()
    out = _as(c, uid).get("/duel/decks").json()["decks"]
    assert [d["id"] for d in out] == ["d1"]
    assert len(_planner_decks(S, uid)) == 1
    pid = _planner_decks(S, uid)[0].id
    assert out[0]["deck"]["plannerDeckId"] == pid
    assert out[0]["updatedAt"] > 500
    assert _duel_rows(S, uid)[0].planner_deck_id == pid
    # Reading again changes nothing.
    again = c.get("/duel/decks").json()["decks"]
    assert again == out
    assert len(c.get("/decks").json()) == 1


def test_reconcile_creates_each_missing_copy_1017(client):
    c, S = client
    uid = _user(S)
    with S() as db:
        from app.services import create_deck

        create_deck(db, db.get(User, uid), "Only planner", _full("OP01-017", OTHER_LEADER))
        create_deck(db, db.get(User, uid), "No leader", "50x OP01-017")
        db.query(DuelSavedDeck).delete()
        db.add(DuelSavedDeck(user_id=uid, deck_id="d1", data=json.dumps(_duel("Only duel")), updated_at_ms=500))
        db.add(
            DuelSavedDeck(
                user_id=uid,
                deck_id="d2",
                data=json.dumps(_duel("Dead link", plannerDeckId=9999, editedLocally=True)),
                updated_at_ms=600,
            )
        )
        db.commit()
    decks = _as(c, uid).get("/decks").json()  # the planner list reconciles too
    assert sorted(d["name"] for d in decks) == ["Dead link", "No leader", "Only duel", "Only planner"]
    rows = c.get("/duel/decks").json()["decks"]
    by_name = {r["deck"]["name"]: r for r in rows}
    assert sorted(by_name) == ["Dead link", "Only duel", "Only planner"]
    assert all(r["deck"]["plannerDeckId"] for r in rows)
    ids = {d["name"]: d["id"] for d in decks}
    # A stale plannerDeckId is re-created, not dropped, and points at the new deck.
    assert by_name["Dead link"]["deck"]["plannerDeckId"] == ids["Dead link"] != 9999
    assert by_name["Only planner"]["deck"]["cards"] == ["OP01-017"] * 50
    assert by_name["Only planner"]["id"].startswith("planner-")


def test_reconcile_links_a_named_planner_deck_and_prefers_the_edited_side_1017(client):
    c, S = client
    uid = _user(S)
    with S() as db:
        from app.services import create_deck

        a = create_deck(db, db.get(User, uid), "A planner", f"1x{LEADER}\n4x OP01-016").id
        b = create_deck(db, db.get(User, uid), "B planner", f"1x{LEADER}\n4x OP01-016").id
        db.query(DuelSavedDeck).delete()
        db.add(DuelSavedDeck(user_id=uid, deck_id="d1", data=json.dumps(_duel("A duel", cards=["OP01-017"], plannerDeckId=a)), updated_at_ms=1))
        db.add(DuelSavedDeck(user_id=uid, deck_id="d2", data=json.dumps(_duel("B duel", cards=["OP01-017"], plannerDeckId=b, editedLocally=True)), updated_at_ms=1))
        db.commit()
    rows = {r["id"]: r["deck"] for r in _as(c, uid).get("/duel/decks").json()["decks"]}
    assert rows["d1"]["name"] == "A planner" and rows["d1"]["cards"] == ["OP01-016"] * 4  # planner wins
    assert rows["d2"]["name"] == "B duel" and rows["d2"]["cards"] == ["OP01-017"]  # edited here wins
    assert _planner_cards(S, b) == {LEADER: 1, "OP01-017": 1}
    assert rows["d2"]["editedLocally"] is None


def test_seed_decks_and_tombstones_are_never_linked_1017(client):
    c, S = client
    uid = _user(S)
    _put(_as(c, uid), "test-starter", 0)
    _put(c, "gone", 100)
    c.delete("/duel/decks/gone", params={"updatedAt": 200})
    with S() as db:  # an older unlinked deck, so the next read has a merge to do
        db.add(DuelSavedDeck(user_id=uid, deck_id="old", data=json.dumps(_duel("Old")), updated_at_ms=5))
        db.commit()
    c.get("/duel/decks")
    c.get("/decks")
    # "gone" was linked when saved; deleting it removed the planner deck. The seed never got one.
    assert [d.name for d in _planner_decks(S, uid)] == ["Old"]
    rows = {r.deck_id: r for r in _duel_rows(S, uid)}
    assert rows["test-starter"].planner_deck_id is None
    assert rows["gone"].deleted is True and rows["gone"].planner_deck_id is None
    assert rows["old"].planner_deck_id is not None


def test_deleting_either_side_deletes_the_other_1017(client):
    c, S = client
    uid = _user(S)
    _put(_as(c, uid), "d1", 1000)
    _put(c, "d2", 1000, _duel("Second", cards=["OP01-017"] * 4))
    first, second = [d.id for d in _planner_decks(S, uid)]
    # Duel -> planner: the planner's Main moves to the remaining same-leader deck.
    assert c.delete("/duel/decks/d1", params={"updatedAt": 2000}).json()["deleted"] is True
    remaining = _planner_decks(S, uid)
    assert [(d.id, d.is_main) for d in remaining] == [(second, True)]
    # Planner -> duel: a tombstone newer than the last write.
    before = {r.deck_id: r.updated_at_ms for r in _duel_rows(S, uid)}["d2"]
    assert c.delete(f"/decks/{second}").status_code == 200
    d2 = {d["id"]: d for d in c.get("/duel/decks").json()["decks"]}["d2"]
    assert d2["deleted"] is True and d2["updatedAt"] > before
    assert {r.deck_id: r.deleted for r in _duel_rows(S, uid)}["d2"] is True
    assert _planner_decks(S, uid) == []
    assert first not in [d.id for d in _planner_decks(S, uid)]


def test_a_full_planner_leaves_new_duel_decks_unlinked_1017(client, monkeypatch: pytest.MonkeyPatch):
    import app.services as services

    monkeypatch.setattr(services, "MAX_DECKS_PER_USER", 1)
    c, S = client
    uid = _user(S)
    _put(_as(c, uid), "d1", 1000)
    res = _put(c, "d2", 1000, _duel("Too many", cards=["OP01-017"] * 4)).json()
    assert len(_planner_decks(S, uid)) == 1
    assert res["deck"]["plannerDeckId"] is None and res["updatedAt"] == 1000
    assert c.get("/duel/decks").status_code == 200  # reconcile retries without failing
    assert len(_planner_decks(S, uid)) == 1


def test_a_full_duel_list_leaves_new_planner_decks_unmirrored_1017(client, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(duel_decks, "MAX_DECKS", 1)
    c, S = client
    uid = _user(S)
    _new_planner(_as(c, uid), "One", _full())
    _new_planner(c, "Two", _full("OP01-017"))
    assert len([r for r in _duel_rows(S, uid) if not r.deleted]) == 1
    assert len(_planner_decks(S, uid)) == 2


def test_startup_adds_the_planner_link_column_to_existing_duel_decks_1017(monkeypatch: pytest.MonkeyPatch):
    engine = make_bare_engine()
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE duel_saved_decks (id INTEGER PRIMARY KEY, user_id INTEGER, deck_id VARCHAR(64))"))
        conn.execute(text("INSERT INTO duel_saved_decks (id, user_id, deck_id) VALUES (1, 1, 'd1')"))
    monkeypatch.setattr(app_db, "engine", engine)
    app_db._ensure_duel_saved_deck_planner_link()
    app_db._ensure_duel_saved_deck_planner_link()
    with engine.connect() as conn:
        assert conn.execute(text("SELECT planner_deck_id FROM duel_saved_decks")).all() == [(None,)]
    assert "ix_duel_saved_decks_planner_deck_id" in {i["name"] for i in inspect(engine).get_indexes("duel_saved_decks")}


def test_a_second_duel_copy_of_a_linked_planner_deck_gets_its_own_planner_deck_1017(client):
    c, S = client
    uid = _user(S)
    _put(_as(c, uid), "d1", 1000)
    pid = _planner_decks(S, uid)[0].id
    # Another device saved a copy that still claims the same planner deck.
    res = _put(c, "d2", 1000, _duel("Copy", plannerDeckId=pid)).json()
    assert len(_planner_decks(S, uid)) == 2
    assert res["deck"]["plannerDeckId"] != pid
    assert {r.deck_id: r.planner_deck_id for r in _duel_rows(S, uid)}["d1"] == pid


def test_a_failing_merge_never_breaks_the_deck_lists_1017(client, monkeypatch: pytest.MonkeyPatch):
    c, S = client
    uid = _user(S)
    _put(_as(c, uid), "d1", 1000)

    def boom(*_a, **_k):
        raise RuntimeError("merge bug")

    monkeypatch.setattr(deck_link, "_needs_reconcile", boom)
    assert c.get("/duel/decks").status_code == 200
    assert [d["name"] for d in c.get("/decks").json()] == ["Red"]




def test_an_incomplete_unlinked_planner_deck_gets_no_duel_copy_but_a_50_card_one_does_1027(client):
    c, S = client
    uid = _user(S)
    _new_planner(_as(c, uid), "Partial", f"1x{LEADER}\n20x OP01-016\n1x DON-001")
    assert _duel_rows(S, uid) == []
    pid = _new_planner(c, "Full", _full("OP01-017"))
    rows = _duel_rows(S, uid)
    assert [r.planner_deck_id for r in rows] == [pid]
    assert len(json.loads(rows[0].data)["cards"]) == 50


def test_the_merge_skips_incomplete_planner_decks_and_does_not_rerun_for_them_1027(client, monkeypatch: pytest.MonkeyPatch):
    c, S = client
    uid = _user(S)
    with S() as db:  # decks that predate the link
        from app.services import create_deck

        user = db.get(User, uid)
        create_deck(db, user, "Partial", f"1x{LEADER}\n20x OP01-016")
        full = create_deck(db, user, "Full", _full("OP01-017", OTHER_LEADER)).id
        db.query(DuelSavedDeck).delete()
        db.commit()
        assert deck_link._needs_reconcile(db, uid) is True  # the complete one is work
    out = _as(c, uid).get("/duel/decks").json()["decks"]
    assert [d["deck"]["plannerDeckId"] for d in out] == [full]
    with S() as db:  # only the partial deck is left unlinked: no work, so no re-run
        assert deck_link._needs_reconcile(db, uid) is False
    assert c.get("/duel/decks").json()["decks"] == out
    assert len(_duel_rows(S, uid)) == 1


def test_a_linked_deck_keeps_syncing_after_it_drops_below_50_cards_1027(client):
    c, S = client
    uid = _user(S)
    pid = _new_planner(_as(c, uid), "Blue", _full())
    assert c.put(f"/decks/{pid}/cards/OP01-016", json={"needed": 30}).status_code == 200
    rows = [r for r in _duel_rows(S, uid) if not r.deleted]
    assert len(rows) == 1 and json.loads(rows[0].data)["cards"] == ["OP01-016"] * 30
    # The merge on a list read leaves it linked too.
    out = c.get("/duel/decks").json()["decks"]
    assert [d["deck"]["plannerDeckId"] for d in out] == [pid]


def _mirrored_planner_deck(c, S, uid, **extra_prefs):
    """A planner deck with its duel copy `planner-<id>` (50 x OP01-016)."""
    pid = _new_planner(_as(c, uid), "Synced", _full())
    if extra_prefs:
        with S() as db:
            row = db.scalar(select(DuelSavedDeck).where(DuelSavedDeck.user_id == uid))
            row.data = json.dumps({**json.loads(row.data), **extra_prefs})
            db.commit()
    return pid


def test_a_guest_deck_identical_to_a_synced_deck_is_dropped_not_duplicated_1027(client):
    c, S = client
    uid = _user(S)
    pid = _mirrored_planner_deck(c, S, uid, artPrefs={"OP01-016": "keep"})
    survivor_before = _duel_rows(S, uid)[0].updated_at_ms
    guest = _duel("Guest copy", cards=["OP01-016"] * 50, artPrefs={"OP01-016": "ignored", "OP01-017": "p9"})
    res = _put(c, "guest-1", 5000, guest).json()
    assert res["deleted"] is True and res["updatedAt"] == 5001
    assert res["mergedInto"] == f"planner-{pid}"
    assert len(_planner_decks(S, uid)) == 1
    rows = {r.deck_id: r for r in _duel_rows(S, uid)}
    assert rows["guest-1"].deleted is True and rows["guest-1"].planner_deck_id is None
    survivor = rows[f"planner-{pid}"]
    assert json.loads(survivor.data)["artPrefs"] == {"OP01-016": "keep", "OP01-017": "p9"}
    assert survivor.updated_at_ms > survivor_before
    # Sending it again (older than the tombstone) stays a tombstone.
    assert _put(c, "guest-1", 5000, guest).json()["deleted"] is True
    assert len(_planner_decks(S, uid)) == 1


def test_the_bulk_first_sign_in_upload_also_drops_an_identical_guest_deck_1027(client):
    c, S = client
    uid = _user(S)
    pid = _mirrored_planner_deck(c, S, uid)
    items = [
        {"id": "g1", "updatedAt": 100, "deck": _duel("Same", cards=["OP01-016"] * 50)},
        {"id": "g2", "updatedAt": 100, "deck": _duel("Other", cards=["OP01-017"] * 4)},
    ]
    out = {d["id"]: d for d in c.put("/duel/decks", json={"decks": items}).json()["decks"]}
    assert (out["g1"]["deleted"], out["g1"]["mergedInto"]) == (True, f"planner-{pid}")
    assert out["g2"]["deleted"] is False and out["g2"]["mergedInto"] is None
    assert len(_planner_decks(S, uid)) == 2


def test_a_guest_deck_that_differs_is_created_normally_1027(client):
    c, S = client
    uid = _user(S)
    _mirrored_planner_deck(c, S, uid)
    for name, deck in {
        "other-cards": _duel("A", cards=["OP01-016"] * 49 + ["OP01-017"]),
        "other-leader": _duel("B", leader=OTHER_LEADER, cards=["OP01-016"] * 50),
    }.items():
        res = _put(c, name, 100, deck).json()
        assert res["deleted"] is False and res["deck"]["plannerDeckId"] is not None
    assert len(_planner_decks(S, uid)) == 3


def test_editing_an_existing_deck_into_a_copy_of_another_is_not_merged_1027(client):
    c, S = client
    uid = _user(S)
    _mirrored_planner_deck(c, S, uid)
    assert _put(c, "mine", 100, _duel("Mine", cards=["OP01-017"] * 4)).json()["deleted"] is False
    res = _put(c, "mine", 200, _duel("Mine", cards=["OP01-016"] * 50)).json()
    assert res["deleted"] is False and res["mergedInto"] is None
    assert len(_planner_decks(S, uid)) == 2


def test_a_guest_deck_with_a_planner_link_or_a_seed_id_is_never_merged_away_1027(client):
    c, S = client
    uid = _user(S)
    pid = _mirrored_planner_deck(c, S, uid)
    same = ["OP01-016"] * 50
    linked = _put(c, "claims", 100, _duel("Claims", cards=same, plannerDeckId=pid)).json()
    seed = _put(c, "test-seed", 100, _duel("Seed", cards=same)).json()
    assert linked["deleted"] is False and seed["deleted"] is False
    assert seed["deck"]["plannerDeckId"] is None
