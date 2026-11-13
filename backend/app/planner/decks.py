"""Deck CRUD, detail views and per-deck card edits."""

from __future__ import annotations

from collections import defaultdict

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import Conflict, Invalid, NotFound
from app.planner.domain import (
    DON_DECK_LIMIT,
    MAIN_DECK_LIMIT,
    ParsedCard,
    deck_size_counts,
    find_leader_id,
    is_don_card,
    parse_cost,
    parse_decklist,
)
from app.core.models import User
from app.planner.models import CatalogCard, Deck, DeckCard, DeckCardPrinting
from app.planner.catalog_repo import (
    alt_arts_map,
    alt_owned_map,
    catalog_map,
    deck_card_lines,
    owned_map,
    primary_product_ids,
)
from app.planner.schemas import CardView, DeckDetail, DeckSummary, PrintingView
from app.planner.printings import (
    _alts_owned_total,
    _apply_alt_want_clamp_to_rows,
    _assert_special_printing,
    _clear_deck_card_printings,
    _collector_map,
    _deck_alt_owned_map,
    _delete_zero_printing_rows,
    _display_choice_map,
    _leader_group_id,
    _printing_wants_for_decks,
    _spread_alt_product_ids,
    _spread_deck_card_rows,
    _write_deck_printing_qty,
)


class DeckOversizeError(Conflict):
    """Raised when adding would push the main deck past MAIN_DECK_LIMIT without confirm."""

    def __init__(self, *, current: int, projected: int, limit: int = MAIN_DECK_LIMIT):
        self.current = current
        self.projected = projected
        self.limit = limit
        message = f"Deck would have {projected} cards (limit {limit}: 50 + 1 leader). Confirm to continue."
        super().__init__(
            message,
            detail={
                "code": "deck_oversize",
                "message": message,
                "current": current,
                "projected": projected,
                "limit": limit,
            },
        )


def _card_view(
    card_id: str,
    needed: int,
    owned: int,
    cat: CatalogCard | None,
    section: str,
    alt_arts: list[PrintingView] | None = None,
    product_id: int | None = None,
    earlier_leaders_need: int = 0,
    earlier_leaders: list[str] | None = None,
    alts_owned: int = 0,
    display_art: int | None = None,
    collector_want: int = 0,
) -> CardView:
    cost = parse_cost(cat.cost) if cat else None
    # Alt copies count as owned for what is still needed.
    available = max(0, owned + alts_owned - earlier_leaders_need)
    return CardView(
        card_id=card_id,
        name=cat.name if cat else "(not in catalog)",
        rarity=cat.rarity if cat else "",
        color=cat.color if cat else "",
        card_type=cat.card_type if cat else "",
        cost=cost,
        needed=needed,
        owned=owned,
        alts_owned=alts_owned,
        still_need=max(0, needed - available),
        earlier_leaders_need=earlier_leaders_need,
        earlier_leaders=earlier_leaders or [],
        market_price=cat.market_price if cat else None,
        low_price=cat.low_price if cat else None,
        image_url=cat.image_url if cat else "",
        tcgplayer_url=cat.tcgplayer_url if cat else "",
        product_id=product_id,
        section=section,
        alt_arts=alt_arts or [],
        display_art=display_art,
        collector_want=collector_want,
    )


def _same_leader_decks(decks: list[Deck], leader_card_id: str | None) -> list[Deck]:
    if not leader_card_id:
        return []
    return [d for d in decks if d.leader_card_id == leader_card_id]


def _resolve_main_deck(decks: list[Deck], leader_card_id: str | None) -> Deck | None:
    """Pick the Main deck for a leader: explicit is_main, else earliest sort_order."""
    group = _same_leader_decks(decks, leader_card_id)
    if not group:
        return None
    marked = [d for d in group if d.is_main]
    if marked:
        # Prefer earliest marked if data ever has more than one.
        return min(marked, key=lambda d: (d.sort_order, d.id))
    return min(group, key=lambda d: (d.sort_order, d.id))


def _clear_main_flags(db: Session, user_id: int, leader_card_id: str, *, except_id: int | None = None) -> None:
    stmt = select(Deck).where(
        Deck.user_id == user_id,
        Deck.leader_card_id == leader_card_id,
        Deck.is_main.is_(True),
    )
    if except_id is not None:
        stmt = stmt.where(Deck.id != except_id)
    for deck in db.scalars(stmt).all():
        deck.is_main = False


def list_decks(db: Session, user: User) -> list[DeckSummary]:
    decks = db.scalars(
        select(Deck)
        .where(Deck.user_id == user.id)
        .options(selectinload(Deck.cards))
        .order_by(Deck.sort_order, Deck.id)
    ).all()
    return _summaries(db, user, decks, decks)


def deck_summary(db: Session, user: User, deck: Deck) -> DeckSummary:
    """The list entry for one deck, without building every other deck's summary."""
    if deck.leader_card_id:
        rivals = db.scalars(
            select(Deck).where(Deck.user_id == user.id, Deck.leader_card_id == deck.leader_card_id)
        ).all()
    else:
        rivals = [deck]
    return _summaries(db, user, [deck], rivals)[0]


def _summaries(db: Session, user: User, decks: list[Deck], main_pool: list[Deck]) -> list[DeckSummary]:
    """Summaries for ``decks``; ``main_pool`` holds the decks that compete for each leader's Main flag."""
    all_ids = {c.card_id for d in decks for c in d.cards}
    leader_ids = {d.leader_card_id for d in decks if d.leader_card_id}
    catalog = catalog_map(db, all_ids | leader_ids)
    owned = owned_map(db, user.id)
    alt_owned = _deck_alt_owned_map(alt_owned_map(db, user.id), _collector_map(db, user.id))
    main_by_leader: dict[str, int] = {}
    for leader_id in leader_ids:
        main = _resolve_main_deck(main_pool, leader_id)
        if main is not None:
            main_by_leader[leader_id] = main.id
    out: list[DeckSummary] = []
    for deck in decks:
        leader = catalog.get(deck.leader_card_id) if deck.leader_card_id else None
        main_cards, don_cards = deck_size_counts(deck_card_lines(deck), catalog)
        owned_copies = sum(
            min(owned.get(c.card_id, 0) + _alts_owned_total(alt_owned, c.card_id), c.needed)
            for c in deck.cards
            if c.needed > 0 and not is_don_card(catalog.get(c.card_id))
        )
        is_main = bool(
            deck.leader_card_id and main_by_leader.get(deck.leader_card_id) == deck.id
        )
        out.append(
            DeckSummary(
                id=deck.id,
                name=deck.name,
                leader_card_id=deck.leader_card_id,
                leader_name=leader.name if leader else None,
                leader_image_url=leader.image_url if leader else "",
                card_count=len(deck.cards),
                total_cards=main_cards,
                main_cards=main_cards,
                don_cards=don_cards,
                owned_copies=owned_copies,
                sort_order=deck.sort_order,
                is_main=is_main,
                hidden_from_friends=bool(deck.hidden_from_friends),
            )
        )
    # Group by leader (no-leader last). Within a group: Main first, then sort_order.
    leader_group_key: dict[str | None, tuple] = {}
    for summary in out:
        key = summary.leader_card_id
        if key in leader_group_key:
            continue
        name = (summary.leader_name or "").casefold()
        # Earliest sort_order among decks in this group anchors group order.
        earliest = min(
            (s.sort_order, s.id)
            for s in out
            if s.leader_card_id == key
        )
        # No-leader decks sort after all leader groups.
        leader_group_key[key] = (key is None, name, earliest[0], earliest[1], key or "")
    out.sort(
        key=lambda s: (
            leader_group_key[s.leader_card_id],
            0 if s.is_main else 1,
            s.sort_order,
            s.id,
        )
    )
    return out


# A legal deck has at most 51 distinct cards; these leave room for want-lists
# while stopping one account from writing unbounded rows.
MAX_DECK_DISTINCT_CARDS = 250


MAX_DECKS_PER_USER = 300


def _check_distinct_card_cap(parsed: list[ParsedCard]) -> None:
    if len(parsed) >= MAX_DECK_DISTINCT_CARDS + 1:
        raise Invalid(f"A deck can list at most {MAX_DECK_DISTINCT_CARDS} different cards")


def create_deck(db: Session, user: User, name: str, decklist: str) -> Deck:
    parsed = parse_decklist(decklist)
    if len(parsed) > MAX_DECK_DISTINCT_CARDS:
        raise Invalid(f"A deck can list at most {MAX_DECK_DISTINCT_CARDS} different cards")
    deck_count = db.scalar(select(func.count(Deck.id)).where(Deck.user_id == user.id)) or 0
    if deck_count >= MAX_DECKS_PER_USER:
        raise Invalid(f"You can keep at most {MAX_DECKS_PER_USER} decks; delete one first")
    catalog = catalog_map(db, {c.card_id for c in parsed})
    leader_id = find_leader_id(parsed, catalog)

    max_order = db.scalar(
        select(Deck.sort_order).where(Deck.user_id == user.id).order_by(Deck.sort_order.desc())
    )
    # First deck for this leader becomes Main so Additional Cards works immediately.
    is_main = False
    if leader_id:
        existing_same = db.scalar(
            select(Deck.id).where(
                Deck.user_id == user.id,
                Deck.leader_card_id == leader_id,
            )
        )
        is_main = existing_same is None
    deck = Deck(
        user_id=user.id,
        name=name.strip(),
        leader_card_id=leader_id,
        is_main=is_main,
        sort_order=(max_order or 0) + 1,
    )
    db.add(deck)
    db.flush()
    for card in parsed:
        db.add(DeckCard(deck_id=deck.id, card_id=card.card_id, needed=card.needed))
    from app.planner import deck_link

    deck_link.mirror_planner_deck(db, user.id, deck)
    db.commit()
    db.refresh(deck)
    # Open group buys with an explicit deck filter should pick up new imports.
    # (Null contribution already means "all decks".)
    from app.group_buy import service as group_buy

    group_buy.include_deck_in_open_group_buys(db, user, deck.id)
    return deck


def clone_deck(db: Session, user: User, source: Deck, name: str) -> Deck:
    """Copy another deck's list (card rows only, not printings) into ``user``'s decks (#703)."""
    deck_count = db.scalar(select(func.count(Deck.id)).where(Deck.user_id == user.id)) or 0
    if deck_count + 1 > MAX_DECKS_PER_USER:
        raise Invalid(f"You can keep at most {MAX_DECKS_PER_USER} decks; delete one first")
    max_order = db.scalar(
        select(Deck.sort_order).where(Deck.user_id == user.id).order_by(Deck.sort_order.desc())
    )
    is_main = False
    if source.leader_card_id:
        is_main = (
            db.scalar(
                select(Deck.id).where(
                    Deck.user_id == user.id, Deck.leader_card_id == source.leader_card_id
                )
            )
            is None
        )
    deck = Deck(
        user_id=user.id,
        name=name[:200],
        leader_card_id=source.leader_card_id,
        is_main=is_main,
        sort_order=(max_order or 0) + 1,
    )
    db.add(deck)
    db.flush()
    for card in source.cards:
        db.add(DeckCard(deck_id=deck.id, card_id=card.card_id, needed=card.needed))
    from app.planner import deck_link

    deck_link.mirror_planner_deck(db, user.id, deck)
    db.commit()
    db.refresh(deck)
    from app.group_buy import service as group_buy

    group_buy.include_deck_in_open_group_buys(db, user, deck.id)
    return deck


def delete_deck(db: Session, user: User, deck_id: int, *, mirror: bool = True) -> None:
    """Delete a deck. ``mirror=False`` is for the duel side deleting its own linked deck (#1017)."""
    deck = db.scalar(select(Deck).where(Deck.id == deck_id, Deck.user_id == user.id))
    if deck is None:
        raise NotFound("Deck not found")
    leader_id = deck.leader_card_id
    was_main = bool(deck.is_main)
    if mirror:
        from app.planner import deck_link

        deck_link.on_planner_deleted(db, user.id, deck_id)
    db.delete(deck)
    db.flush()
    if was_main and leader_id:
        remaining = db.scalars(
            select(Deck)
            .where(Deck.user_id == user.id, Deck.leader_card_id == leader_id)
            .order_by(Deck.sort_order, Deck.id)
        ).all()
        if remaining:
            remaining[0].is_main = True
    db.commit()


def rename_deck(db: Session, user: User, deck_id: int, name: str) -> DeckDetail:
    """Rename one of the user's decks (#526). Raises LookupError for a deck that is not theirs."""
    deck = db.scalar(select(Deck).where(Deck.id == deck_id, Deck.user_id == user.id))
    if deck is None:
        raise NotFound("Deck not found")
    name = name.strip()
    if not name or len(name) > 200:
        raise Invalid("Deck name must be 1 to 200 characters")
    deck.name = name
    from app.planner import deck_link

    deck_link.mirror_planner_deck(db, user.id, deck)
    db.commit()
    return get_deck_detail(db, user, deck_id)


def update_deck(
    db: Session,
    user: User,
    deck_id: int,
    name: str | None,
    hidden_from_friends: bool | None = None,
) -> DeckDetail:
    """PATCH /decks/{id}: rename and/or hide the deck from friends (#703)."""
    if name is None and hidden_from_friends is None:
        raise Invalid("Nothing to update")
    detail: DeckDetail | None = None
    if name is not None:
        detail = rename_deck(db, user, deck_id, name)
    if hidden_from_friends is not None:
        deck = db.scalar(select(Deck).where(Deck.id == deck_id, Deck.user_id == user.id))
        if deck is None:
            raise NotFound("Deck not found")
        deck.hidden_from_friends = hidden_from_friends
        db.commit()
        detail = get_deck_detail(db, user, deck_id)
    assert detail is not None
    return detail


def set_deck_as_main(db: Session, user: User, deck_id: int) -> DeckDetail:
    """Mark this deck as Main for its leader; other same-leader decks compare against it."""
    deck = db.scalar(select(Deck).where(Deck.id == deck_id, Deck.user_id == user.id))
    if deck is None:
        raise NotFound("Deck not found")
    if not deck.leader_card_id:
        raise Invalid("Deck has no leader — cannot set as Main")
    _clear_main_flags(db, user.id, deck.leader_card_id, except_id=deck.id)
    deck.is_main = True
    db.commit()
    return get_deck_detail(db, user, deck_id)


def get_deck_detail(
    db: Session, user: User, deck_id: int, deck_ids: list[int] | None = None
) -> DeckDetail:
    decks = db.scalars(
        select(Deck)
        .where(Deck.user_id == user.id)
        .options(selectinload(Deck.cards))
        .order_by(Deck.sort_order, Deck.id)
    ).all()
    target = next((d for d in decks if d.id == deck_id), None)
    if target is None:
        raise NotFound("Deck not found")

    owned = owned_map(db, user.id)
    alt_owned = alt_owned_map(db, user.id)
    collector = _collector_map(db, user.id)
    deck_alt_owned = _deck_alt_owned_map(alt_owned, collector)
    display_choices = _display_choice_map(db, user.id)
    all_ids = {c.card_id for d in decks for c in d.cards}
    leader_ids = {d.leader_card_id for d in decks if d.leader_card_id}
    catalog = catalog_map(db, all_ids | leader_ids)
    deck_wants = _printing_wants_for_decks(db, [target.id]).get(target.id, {})
    alts = alt_arts_map(db, all_ids, wanted=deck_wants, owned=alt_owned, collector=collector)
    product_ids = primary_product_ids(db, all_ids)

    baseline = _resolve_main_deck(decks, target.leader_card_id)
    is_main = baseline is not None and baseline.id == target.id
    prior_ids: set[str] = set()
    prior_names: list[str] = []
    if baseline is not None and not is_main:
        prior_names = [baseline.name]
        prior_ids = {c.card_id for c in baseline.cards}

    # "Separate per leader": owned copies go to leaders in deck order, so this
    # deck only gets what earlier leaders leave over (matches Master Shopping).
    earlier_need: dict[str, int] = defaultdict(int)
    earlier_labels: dict[str, list[str]] = defaultdict(list)
    if getattr(user, "sum_across_leaders", False):
        # Only decks ticked under Include decks claim copies first (this deck always counts).
        counted = decks if deck_ids is None else [d for d in decks if d.id in deck_ids or d.id == target.id]
        # Leader groups are ordered by their first deck (same as Master Shopping).
        group_order: dict[str, int] = {}
        for idx, deck in enumerate(counted):
            group_order.setdefault(_leader_group_id(deck), idx)
        target_rank = group_order[_leader_group_id(target)]
        group_need: dict[str, dict[str, int]] = {}
        group_label: dict[str, str] = {}
        for deck in counted:
            group = _leader_group_id(deck)
            if group_order[group] >= target_rank:
                continue
            if group not in group_label:
                leader = catalog.get(deck.leader_card_id) if deck.leader_card_id else None
                group_label[group] = leader.name if leader else deck.name
            by_card = group_need.setdefault(group, {})
            for c in deck.cards:
                by_card[c.card_id] = max(by_card.get(c.card_id, 0), c.needed)
        for group, by_card in group_need.items():
            for card_id, n in by_card.items():
                earlier_need[card_id] += n
                earlier_labels[card_id].append(group_label[group])

    cards: list[CardView] = []
    for card in target.cards:
        cat = catalog.get(card.card_id)
        if is_don_card(cat):
            section = "don"
        elif not prior_ids:
            section = "main"
        elif card.card_id not in prior_ids:
            section = "additional"
        else:
            section = "main"
        cards.append(
            _card_view(
                card.card_id,
                card.needed,
                owned.get(card.card_id, 0),
                cat,
                section,
                alts.get(card.card_id, []),
                product_ids.get(card.card_id),
                earlier_leaders_need=earlier_need.get(card.card_id, 0),
                earlier_leaders=earlier_labels.get(card.card_id, []),
                alts_owned=_alts_owned_total(deck_alt_owned, card.card_id),
                display_art=display_choices.get(card.card_id),
                collector_want=sum(collector.get(card.card_id, {}).values()),
            )
        )

    leader_name = None
    if target.leader_card_id and target.leader_card_id in catalog:
        leader_name = catalog[target.leader_card_id].name

    main_cards, don_cards = deck_size_counts(deck_card_lines(target), catalog)

    return DeckDetail(
        id=target.id,
        name=target.name,
        leader_card_id=target.leader_card_id,
        leader_name=leader_name,
        prior_decks=prior_names,
        is_main=is_main,
        hidden_from_friends=bool(target.hidden_from_friends),
        cards=cards,
        main_cards=main_cards,
        don_cards=don_cards,
    )


def set_deck_leader(db: Session, user_id: int, deck: Deck, new_leader: str | None) -> None:
    """Point ``deck`` at a leader and keep each leader's Main deck consistent."""
    prev_leader = deck.leader_card_id
    was_main = bool(deck.is_main)
    deck.leader_card_id = new_leader
    if prev_leader != new_leader:
        deck.is_main = False
        db.flush()
        if was_main and prev_leader:
            remaining = db.scalars(
                select(Deck)
                .where(
                    Deck.user_id == user_id,
                    Deck.leader_card_id == prev_leader,
                    Deck.id != deck.id,
                )
                .order_by(Deck.sort_order, Deck.id)
            ).all()
            if remaining and not any(d.is_main for d in remaining):
                remaining[0].is_main = True
        if new_leader:
            peers = db.scalars(
                select(Deck).where(
                    Deck.user_id == user_id,
                    Deck.leader_card_id == new_leader,
                    Deck.id != deck.id,
                )
            ).all()
            if not peers:
                deck.is_main = True
    elif not new_leader:
        deck.is_main = False


def upsert_deck_card(
    db: Session,
    user: User,
    deck_id: int,
    card_id: str,
    needed: int,
    *,
    confirm_oversize: bool = False,
) -> DeckDetail:
    """Set absolute needed count for a card in a deck (0 removes)."""
    card_id = card_id.strip().upper()
    if not card_id:
        raise Invalid("card_id is required")
    if needed < 0:
        raise Invalid("needed must be >= 0")

    deck = db.scalar(
        select(Deck)
        .where(Deck.id == deck_id, Deck.user_id == user.id)
        .options(selectinload(Deck.cards))
    )
    if deck is None:
        raise NotFound("Deck not found")

    existing = next((c for c in deck.cards if c.card_id == card_id), None)
    catalog_ids = {c.card_id for c in deck.cards} | {card_id}
    catalog = catalog_map(db, catalog_ids)

    projected: dict[str, int] = {c.card_id: c.needed for c in deck.cards}
    if needed <= 0:
        projected.pop(card_id, None)
    else:
        projected[card_id] = needed
    projected_lines = [ParsedCard(card_id=cid, needed=qty) for cid, qty in projected.items()]

    main_now, _don_now = deck_size_counts(deck_card_lines(deck), catalog)
    main_projected, don_projected = deck_size_counts(projected_lines, catalog)

    if don_projected > DON_DECK_LIMIT:
        raise Invalid(
            f"DON!! deck would have {don_projected} cards (maximum {DON_DECK_LIMIT})"
        )

    # Only prompt when crossing the 51-card limit. Once the deck is already over
    # size (user confirmed), further adds do not re-prompt until it drops to 51
    # or below again.
    if (
        main_projected > MAIN_DECK_LIMIT
        and main_now <= MAIN_DECK_LIMIT
        and not confirm_oversize
    ):
        raise DeckOversizeError(current=main_now, projected=main_projected)

    if needed <= 0:
        if existing is not None:
            db.delete(existing)
        _clear_deck_card_printings(db, deck.id, card_id)
    elif existing is None:
        db.add(DeckCard(deck_id=deck.id, card_id=card_id, needed=needed))
    else:
        existing.needed = needed
        # Auto-clamp alt wants when Need drops below their sum.
        printing_rows = db.scalars(
            select(DeckCardPrinting).where(
                DeckCardPrinting.deck_id == deck.id,
                DeckCardPrinting.card_id == card_id,
            )
        ).all()
        if printing_rows:
            _apply_alt_want_clamp_to_rows(printing_rows, needed)
            _delete_zero_printing_rows(db, printing_rows)

    new_leader = find_leader_id(projected_lines, catalog)
    set_deck_leader(db, user.id, deck, new_leader)
    from app.planner import deck_link

    deck_link.mirror_planner_deck(db, user.id, deck)
    db.commit()
    return get_deck_detail(db, user, deck_id)


def replace_deck_list(db: Session, user: User, deck_id: int, decklist: str) -> DeckDetail:
    """Overwrite a deck's leader and cards with a pasted deck code (#1016).

    Keeps the deck's id, name, order and visibility.
    """
    deck = db.scalar(
        select(Deck)
        .where(Deck.id == deck_id, Deck.user_id == user.id)
        .options(selectinload(Deck.cards))
    )
    if deck is None:
        raise NotFound("Deck not found")
    parsed = parse_decklist(decklist)  # ValueError("No cards found...") when empty
    _check_distinct_card_cap(parsed)
    catalog = catalog_map(db, {c.card_id for c in parsed})
    _main, don_count = deck_size_counts(parsed, catalog)
    if don_count > DON_DECK_LIMIT:
        raise Invalid(f"DON!! deck would have {don_count} cards (maximum {DON_DECK_LIMIT})")

    new_needed = {c.card_id: c.needed for c in parsed}
    existing = {c.card_id: c for c in deck.cards}
    for card_id, row in existing.items():
        if card_id not in new_needed:
            db.delete(row)
            _clear_deck_card_printings(db, deck.id, card_id)
            continue
        row.needed = new_needed[card_id]
        printing_rows = db.scalars(
            select(DeckCardPrinting).where(
                DeckCardPrinting.deck_id == deck.id,
                DeckCardPrinting.card_id == card_id,
            )
        ).all()
        if printing_rows:
            _apply_alt_want_clamp_to_rows(printing_rows, row.needed)
            _delete_zero_printing_rows(db, printing_rows)
    for new_id, new_qty in new_needed.items():
        if new_id not in existing:
            db.add(DeckCard(deck_id=deck.id, card_id=new_id, needed=new_qty))

    set_deck_leader(db, user.id, deck, find_leader_id(parsed, catalog))
    from app.planner import deck_link

    deck_link.mirror_planner_deck(db, user.id, deck)
    db.commit()
    return get_deck_detail(db, user, deck_id)


def set_deck_card_printing(
    db: Session,
    user: User,
    deck_id: int,
    card_id: str,
    product_id: int,
    qty: int,
) -> DeckDetail:
    """Set alt-art want qty for a card in a deck. Sum of alts cannot exceed needed."""
    card_id = card_id.strip().upper()
    if not card_id:
        raise Invalid("card_id is required")
    if qty < 0:
        raise Invalid("qty must be >= 0")
    if product_id <= 0:
        raise Invalid("product_id must be positive")

    deck = db.scalar(
        select(Deck)
        .where(Deck.id == deck_id, Deck.user_id == user.id)
        .options(selectinload(Deck.cards))
    )
    if deck is None:
        raise NotFound("Deck not found")

    deck_card = next((c for c in deck.cards if c.card_id == card_id), None)
    if deck_card is None:
        raise NotFound("Card not in deck")

    _assert_special_printing(db, card_id, product_id)
    _write_deck_printing_qty(
        db,
        deck_id=deck.id,
        card_id=card_id,
        product_id=product_id,
        qty=qty,
        needed=deck_card.needed,
        strict=True,
    )
    db.commit()
    return get_deck_detail(db, user, deck_id)


def spread_deck_card_arts(db: Session, user: User, deck_id: int, card_id: str) -> DeckDetail:
    """"One of each art" (#1292): spread this deck's copies evenly over the base art and every alt."""
    card_id = card_id.strip().upper()
    deck = db.scalar(
        select(Deck)
        .where(Deck.id == deck_id, Deck.user_id == user.id)
        .options(selectinload(Deck.cards))
    )
    if deck is None:
        raise NotFound("Deck not found")
    deck_card = next((c for c in deck.cards if c.card_id == card_id), None)
    if deck_card is None:
        raise NotFound("Card not in deck")
    product_ids = _spread_alt_product_ids(db, card_id)
    if not product_ids:
        raise Invalid("This card has no alt arts")
    _spread_deck_card_rows(db, deck.id, card_id, deck_card.needed, product_ids)
    db.commit()
    return get_deck_detail(db, user, deck_id)
