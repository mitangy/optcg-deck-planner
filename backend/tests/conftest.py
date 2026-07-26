from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import Base, CatalogCard, CatalogPrinting, Deck, DeckCard, Owned, User


@pytest.fixture()
def db() -> Session:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


def make_user(db: Session, *, email: str, name: str, sub: str) -> User:
    user = User(email=email, name=name, google_sub=sub)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def add_catalog(
    db: Session,
    card_id: str,
    *,
    name: str,
    product_id: int,
    market: float,
    special: bool = False,
) -> None:
    # Keep CatalogCard as the preferred (non-special) face unless this is the first insert.
    existing = db.get(CatalogCard, card_id)
    if existing is None or not special:
        db.merge(
            CatalogCard(
                card_id=card_id,
                name=name,
                market_price=market,
                low_price=market,
                tcgplayer_url=f"https://example.test/{product_id}",
                image_url="",
                group_name="Test Set",
                is_special=1 if special else 0,
            )
        )
    db.add(
        CatalogPrinting(
            card_id=card_id,
            product_id=product_id,
            name=name + (" (Alt)" if special else ""),
            market_price=market,
            low_price=market,
            tcgplayer_url=f"https://example.test/{product_id}",
            image_url="",
            group_name="Test Set",
            is_special=1 if special else 0,
        )
    )
    db.commit()


def add_deck_with_cards(
    db: Session,
    user: User,
    name: str,
    cards: dict[str, int],
) -> Deck:
    deck = Deck(user_id=user.id, name=name)
    db.add(deck)
    db.flush()
    for card_id, needed in cards.items():
        db.add(DeckCard(deck_id=deck.id, card_id=card_id, needed=needed))
    db.commit()
    db.refresh(deck)
    return deck


def set_owned(db: Session, user: User, card_id: str, qty: int) -> None:
    from sqlalchemy import select

    row = db.scalar(
        select(Owned).where(Owned.user_id == user.id, Owned.card_id == card_id)
    )
    if row is None:
        db.add(Owned(user_id=user.id, card_id=card_id, qty=qty))
    else:
        row.qty = qty
    db.commit()
