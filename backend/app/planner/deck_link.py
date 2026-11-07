"""Always-on two-way sync between duel saved decks and planner decks (#1017).

A duel row (``DuelSavedDeck``) and a planner ``Deck`` are linked by
``DuelSavedDeck.planner_deck_id`` (mirrored in the row's ``data.plannerDeckId``).
Whichever side changes writes the other side directly (never through the
service functions that trigger a mirror), so there are no loops:

* duel -> planner: ``after_duel_upsert`` (called by the duel deck PUT endpoints)
* planner -> duel: ``mirror_planner_deck`` (called by the planner deck mutations)
* ``reconcile_user`` links and fills in every deck that is not linked yet; it runs
  when a deck list is read, so existing accounts are merged on their next visit.

A planner deck that is not linked yet gets its duel copy only once its main deck has exactly
``COMPLETE_MAIN`` cards (partial planner decks stay planner-only). Once linked it keeps syncing
even when later edits make it incomplete, so a duel copy never vanishes mid-edit. Duel -> planner
has no such rule.

Decks that cannot be mirrored stay unlinked and are retried by the next reconcile:
no leader (or a leader the catalog does not know), a deck limit on the other side,
or a main deck longer than the duel row can hold. Built-in ``test-`` seed decks are
never linked.
"""

from __future__ import annotations

import json
import logging
import time
from collections import Counter

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session, selectinload

from app.duel import decks
from app.planner.domain import is_don_card, is_leader_card
from app.models import Deck, DeckCard, DeckCardPrinting, DuelSavedDeck, User
from app.planner.catalog_repo import catalog_map

log = logging.getLogger(__name__)

# Deleting a linked deck on one side deletes the other side too. False only unlinks: the
# surviving copy stays, and the next reconcile gives it a fresh counterpart on the side that
# was deleted (there is no "stay independent" state while decks sync at all times).
DELETE_PROPAGATES = True

SEED_PREFIX = "test-"
# Longest main deck a duel row can hold (DuelDeckBody.cards).
MAX_DUEL_CARDS = 60
# Main-deck size (without the leader and DON!!) an unlinked planner deck needs to get a duel copy.
COMPLETE_MAIN = 50


# --- duel row helpers -------------------------------------------------------


def _now_ms() -> int:
    return int(time.time() * 1000)


def _dump(body: dict) -> str:
    return json.dumps(body, separators=(",", ":"), sort_keys=True)


def _body(row: DuelSavedDeck) -> dict | None:
    if row.deleted or not row.data:
        return None
    try:
        body = json.loads(row.data)
    except ValueError:
        return None
    return body if isinstance(body, dict) else None


def _is_seed(row: DuelSavedDeck) -> bool:
    return row.deck_id.startswith(SEED_PREFIX)


def _live_rows(db: Session, user_id: int) -> list[DuelSavedDeck]:
    return list(
        db.scalars(
            select(DuelSavedDeck)
            .where(DuelSavedDeck.user_id == user_id, DuelSavedDeck.deleted.is_(False))
            .order_by(DuelSavedDeck.id)
        ).all()
    )


def _linked_rows(db: Session, user_id: int, planner_id: int) -> list[DuelSavedDeck]:
    return list(
        db.scalars(
            select(DuelSavedDeck)
            .where(
                DuelSavedDeck.user_id == user_id,
                DuelSavedDeck.planner_deck_id == planner_id,
                DuelSavedDeck.deleted.is_(False),
            )
            .order_by(DuelSavedDeck.id)
        ).all()
    )


def _store(row: DuelSavedDeck, body: dict, *, at: int) -> None:
    row.data = _dump(body)
    row.deleted = False
    row.planner_deck_id = body.get("plannerDeckId")
    row.updated_at_ms = at


# --- planner deck helpers ---------------------------------------------------


def _owned_deck(db: Session, user_id: int, planner_id: object) -> Deck | None:
    if not isinstance(planner_id, int) or isinstance(planner_id, bool):
        return None
    return db.scalar(select(Deck).where(Deck.id == planner_id, Deck.user_id == user_id))


def _catalog(db: Session, ids: set[str]):
    return catalog_map(db, ids)


def _main_counts(cards: list[tuple[str, int]], leader: str | None, catalog) -> Counter:
    """Main-deck copies of a planner deck: no leader, no DON!!."""
    out: Counter = Counter()
    for card_id, needed in cards:
        if needed <= 0 or card_id == leader or is_don_card(catalog.get(card_id)):
            continue
        out[card_id] += needed
    return out


def _planner_main(db: Session, deck: Deck) -> Counter:
    """Fresh from the database: the caller may have pending, unflushed card rows."""
    db.flush()
    rows = db.execute(
        select(DeckCard.card_id, DeckCard.needed).where(DeckCard.deck_id == deck.id)
    ).all()
    catalog = _catalog(db, {r[0] for r in rows})
    return _main_counts([(r[0], r[1]) for r in rows], deck.leader_card_id, catalog)


def _is_complete(db: Session, deck: Deck) -> bool:
    return sum(_planner_main(db, deck).values()) == COMPLETE_MAIN


def _expand(counts: Counter) -> list[str]:
    return [card_id for card_id, n in sorted(counts.items()) for _ in range(n)]


def _duel_main(body: dict) -> Counter:
    return Counter(str(c).strip().upper() for c in body.get("cards") or [])


def _known_leader(db: Session, leader: str) -> bool:
    return is_leader_card(_catalog(db, {leader}).get(leader))


def _new_planner_deck(db: Session, user_id: int, body: dict) -> Deck | None:
    """Create a planner deck from a duel deck body. None when it cannot be (limit, unknown leader)."""
    from app.planner.decks import MAX_DECKS_PER_USER

    leader = str(body.get("leaderId") or "").strip().upper()
    if not leader or not _known_leader(db, leader):
        return None
    count = db.scalar(select(func.count(Deck.id)).where(Deck.user_id == user_id)) or 0
    if count >= MAX_DECKS_PER_USER:
        return None
    max_order = db.scalar(
        select(Deck.sort_order).where(Deck.user_id == user_id).order_by(Deck.sort_order.desc())
    )
    same_leader = db.scalar(
        select(Deck.id).where(Deck.user_id == user_id, Deck.leader_card_id == leader)
    )
    deck = Deck(
        user_id=user_id,
        name=(str(body.get("name") or "").strip() or "Duel deck")[:200],
        leader_card_id=leader,
        is_main=same_leader is None,
        sort_order=(max_order or 0) + 1,
    )
    db.add(deck)
    db.flush()
    wanted = _duel_main(body)
    wanted[leader] += 1
    for card_id, n in wanted.items():
        db.add(DeckCard(deck_id=deck.id, card_id=card_id, needed=n))
    db.flush()
    user = db.get(User, user_id)
    if user is not None:
        from app.group_buy import service as group_buy

        group_buy.include_deck_in_open_group_buys(db, user, deck.id)
    return deck


def _apply_duel_to_planner(db: Session, user_id: int, deck: Deck, body: dict) -> None:
    """Make the planner deck's name, leader and non-DON card rows match the duel deck."""
    from app.planner.printings import (
        _apply_alt_want_clamp_to_rows,
        _clear_deck_card_printings,
        _delete_zero_printing_rows,
    )
    from app.planner.decks import set_deck_leader

    leader = str(body.get("leaderId") or "").strip().upper()
    if not leader or not _known_leader(db, leader):
        return
    db.flush()
    rows = list(db.scalars(select(DeckCard).where(DeckCard.deck_id == deck.id)).all())
    wanted = _duel_main(body)
    wanted[leader] += 1
    catalog = _catalog(db, {r.card_id for r in rows})
    seen: set[str] = set()
    for row in rows:
        if is_don_card(catalog.get(row.card_id)):
            continue  # the duel deck has no DON!! rows: leave the planner's alone
        seen.add(row.card_id)
        want = wanted.get(row.card_id, 0)
        if want <= 0:
            db.delete(row)
            _clear_deck_card_printings(db, deck.id, row.card_id)
        elif row.needed != want:
            row.needed = want
            printings = db.scalars(
                select(DeckCardPrinting).where(
                    DeckCardPrinting.deck_id == deck.id, DeckCardPrinting.card_id == row.card_id
                )
            ).all()
            if printings:
                _apply_alt_want_clamp_to_rows(list(printings), want)
                _delete_zero_printing_rows(db, list(printings))
    for card_id, n in wanted.items():
        if card_id not in seen:
            db.add(DeckCard(deck_id=deck.id, card_id=card_id, needed=n))
    name = str(body.get("name") or "").strip()
    if name:
        deck.name = name[:200]
    set_deck_leader(db, user_id, deck, leader)
    db.flush()


# --- duel -> planner --------------------------------------------------------


def after_duel_upsert(db: Session, user_id: int, row: DuelSavedDeck) -> None:
    """A duel deck write was accepted: create or update its planner deck and link them."""
    body = _body(row)
    if body is None or _is_seed(row) or not body.get("leaderId"):
        return
    deck = _owned_deck(db, user_id, row.planner_deck_id)
    if deck is None:
        # A client-supplied link counts only for an existing deck nothing else is linked to.
        claim = _owned_deck(db, user_id, body.get("plannerDeckId"))
        if claim is not None and not any(r.id != row.id for r in _linked_rows(db, user_id, claim.id)):
            deck = claim
    if deck is not None:
        _apply_duel_to_planner(db, user_id, deck, body)
    else:
        deck = _new_planner_deck(db, user_id, body)
    if deck is None:
        row.planner_deck_id = None
        return
    _finish_link(row, body, deck)


def find_duplicate_survivor(
    db: Session, user_id: int, deck_id: str, body: dict
) -> DuelSavedDeck | None:
    """A live, linked duel row of the user with the same leader and main deck as a brand-new
    unlinked incoming deck (a guest deck uploaded on sign-in), or None."""
    if deck_id.startswith(SEED_PREFIX) or body.get("plannerDeckId") is not None:
        return None
    leader = str(body.get("leaderId") or "").strip().upper()
    if not leader:
        return None
    key = _duel_main(body)
    for other in _live_rows(db, user_id):
        other_body = _body(other)
        if (
            other_body is None
            or other.deck_id == deck_id
            or _is_seed(other)
            or other.planner_deck_id is None
            or str(other_body.get("leaderId") or "").strip().upper() != leader
            or _duel_main(other_body) != key
        ):
            continue
        return other
    return None


def merge_into_survivor(survivor: DuelSavedDeck, body: dict) -> None:
    """Carry the duplicate's art picks over to the surviving row (only cards it has no pick for)."""
    survivor_body = _body(survivor)
    extra = body.get("artPrefs") or {}
    if survivor_body is None or not extra:
        return
    prefs = dict(survivor_body.get("artPrefs") or {})
    added = {k: v for k, v in extra.items() if k not in prefs}
    if not added:
        return
    prefs.update(added)
    _store(survivor, {**survivor_body, "artPrefs": prefs}, at=max(_now_ms(), survivor.updated_at_ms + 1))


def _finish_link(row: DuelSavedDeck, body: dict, deck: Deck) -> None:
    """Record the link in the row; the client adopts the change through its newer updatedAt."""
    linked = {k: v for k, v in body.items() if k != "editedLocally"}
    linked["plannerDeckId"] = deck.id
    row.planner_deck_id = deck.id
    if linked != body:
        _store(row, linked, at=row.updated_at_ms + 1)


# --- planner -> duel --------------------------------------------------------


def _duel_body_from_planner(db: Session, deck: Deck, old: dict | None) -> dict | None:
    if not deck.leader_card_id:
        return None
    cards = _expand(_planner_main(db, deck))
    if len(cards) > MAX_DUEL_CARDS:
        return None
    body = {k: v for k, v in (old or {}).items() if k != "editedLocally"}
    body.update(
        name=deck.name, leaderId=deck.leader_card_id, cards=cards, plannerDeckId=deck.id
    )
    return body


def _write_from_planner(db: Session, row: DuelSavedDeck, deck: Deck) -> None:
    old = _body(row)
    body = _duel_body_from_planner(db, deck, old)
    if body is None or body == old:
        row.planner_deck_id = deck.id
        return
    _store(row, body, at=max(_now_ms(), row.updated_at_ms + 1))


def _new_duel_row(db: Session, user_id: int, deck: Deck, body: dict) -> DuelSavedDeck | None:
    live = decks.live_count(db, user_id)
    if live >= decks.MAX_DECKS:
        return None
    for n in range(1, 6):
        deck_id = f"planner-{deck.id}" + ("" if n == 1 else f"-{n}")
        row = decks.find_row(db, user_id, deck_id)
        if row is None:
            if decks.row_count(db, user_id) >= decks.MAX_ROWS:
                return None
            row = DuelSavedDeck(user_id=user_id, deck_id=deck_id, updated_at_ms=0)
            db.add(row)
        elif not row.deleted:
            continue
        _store(row, body, at=max(_now_ms(), row.updated_at_ms + 1))
        db.flush()
        return row
    return None


def mirror_planner_deck(db: Session, user_id: int, deck: Deck) -> None:
    """A planner deck changed: write its duel copy (created when there is none yet and the deck has 50 cards)."""
    rows = _linked_rows(db, user_id, deck.id)
    if rows:
        _write_from_planner(db, rows[0], deck)
        return
    body = _duel_body_from_planner(db, deck, None)
    if body is not None and len(body["cards"]) == COMPLETE_MAIN:
        _new_duel_row(db, user_id, deck, body)


# --- deletes ----------------------------------------------------------------


def on_planner_deleted(db: Session, user_id: int, planner_id: int) -> None:
    """A planner deck is being deleted: delete (or just unlink) its duel copy."""
    for row in _linked_rows(db, user_id, planner_id):
        at = max(_now_ms(), row.updated_at_ms + 1)
        if DELETE_PROPAGATES:
            row.data = ""
            row.deleted = True
        else:
            body = _body(row) or {}
            body.pop("plannerDeckId", None)
            row.data = _dump(body)
        row.planner_deck_id = None
        row.updated_at_ms = at


def on_duel_deleted(db: Session, user: User, row: DuelSavedDeck, planner_id: int | None) -> None:
    """A duel deck was deleted by the player: delete (or just unlink) its planner deck."""
    row.planner_deck_id = None
    if planner_id is None or not DELETE_PROPAGATES:
        return
    from app.planner.decks import delete_deck

    try:
        delete_deck(db, user, planner_id, mirror=False)
    except LookupError:
        pass  # already gone


# --- merge of everything not linked yet -------------------------------------


def _needs_reconcile(db: Session, user_id: int) -> bool:
    unlinked_duel = db.scalar(
        select(func.count())
        .select_from(DuelSavedDeck)
        .where(
            DuelSavedDeck.user_id == user_id,
            DuelSavedDeck.deleted.is_(False),
            DuelSavedDeck.planner_deck_id.is_(None),
            ~DuelSavedDeck.deck_id.startswith(SEED_PREFIX, autoescape=True),
        )
    )
    if unlinked_duel:
        return True
    linked_ids = select(DuelSavedDeck.planner_deck_id).where(
        DuelSavedDeck.user_id == user_id,
        DuelSavedDeck.deleted.is_(False),
        DuelSavedDeck.planner_deck_id.is_not(None),
    )
    unlinked = db.scalars(
        select(Deck).where(
            Deck.user_id == user_id,
            Deck.leader_card_id.is_not(None),
            Deck.id.not_in(linked_ids),
        )
    ).all()
    # Incomplete ones stay planner-only, so they are no work (else the merge would re-run on every read).
    return any(_is_complete(db, d) for d in unlinked)


def reconcile_user(db: Session, user: User) -> None:
    """Merge the user's decks (see ``_reconcile``). A failure is logged and rolled back, never raised:
    this runs on the deck lists, which must keep loading."""
    try:
        _reconcile(db, user)
    except Exception:
        db.rollback()
        log.exception("deck link merge failed for user %s", user.id)


def _reconcile(db: Session, user: User) -> None:
    """Link every deck of the user that is not linked yet, creating the missing copies.

    Order: (1) rows already linked keep their link; (2) a row whose data names an existing,
    unclaimed planner deck is linked to it (the duel copy wins when it was edited locally,
    otherwise the planner's version does); (3) an unlinked duel deck and an unlinked planner
    deck with the same leader and main deck are linked to each other, so identical decks are
    not duplicated; (4) the remaining duel decks get a new planner deck (a plannerDeckId whose
    planner deck is gone counts as unlinked here: the deck is re-created rather than lost);
    (5) the remaining planner decks with a leader and exactly 50 main cards get a new duel deck
    (smaller ones stay planner-only until they are complete). Idempotent.
    """
    uid = user.id
    if not _needs_reconcile(db, uid):
        return
    if db.get_bind().dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(1017, :uid)"), {"uid": uid})
    planner = {
        d.id: d
        for d in db.scalars(
            select(Deck)
            .where(Deck.user_id == uid)
            .options(selectinload(Deck.cards))
            .order_by(Deck.sort_order, Deck.id)
        ).all()
    }
    taken: set[int] = set()
    todo: list[tuple[DuelSavedDeck, dict]] = []
    for row in _live_rows(db, uid):
        body = _body(row)
        if body is None or _is_seed(row) or not body.get("leaderId"):
            continue
        pid = row.planner_deck_id
        if pid in planner and pid not in taken:
            taken.add(pid)
            continue
        row.planner_deck_id = None
        todo.append((row, body))

    rest: list[tuple[DuelSavedDeck, dict]] = []
    for row, body in todo:
        claim = body.get("plannerDeckId")
        if isinstance(claim, int) and claim in planner and claim not in taken:
            taken.add(claim)
            deck = planner[claim]
            if body.get("editedLocally"):
                _apply_duel_to_planner(db, uid, deck, body)
                _finish_link(row, body, deck)
            else:
                row.planner_deck_id = deck.id
                _write_from_planner(db, row, deck)
            continue
        rest.append((row, body))

    catalog = _catalog(db, {c.card_id for d in planner.values() for c in d.cards})
    buckets: dict[tuple, list[Deck]] = {}
    for deck in planner.values():
        if deck.id in taken or not deck.leader_card_id:
            continue
        counts = _main_counts([(c.card_id, c.needed) for c in deck.cards], deck.leader_card_id, catalog)
        buckets.setdefault((deck.leader_card_id, tuple(sorted(counts.items()))), []).append(deck)
    unmatched: list[tuple[DuelSavedDeck, dict]] = []
    for row, body in rest:
        key = (str(body["leaderId"]).strip().upper(), tuple(sorted(_duel_main(body).items())))
        if buckets.get(key):
            deck = buckets[key].pop(0)
            taken.add(deck.id)
            row.planner_deck_id = deck.id
            _write_from_planner(db, row, deck)
        else:
            unmatched.append((row, body))

    for row, body in unmatched:
        deck = _new_planner_deck(db, uid, body)
        if deck is not None:
            taken.add(deck.id)
            _finish_link(row, body, deck)

    for deck in planner.values():
        if deck.id not in taken:
            mirror_planner_deck(db, uid, deck)
    db.commit()
