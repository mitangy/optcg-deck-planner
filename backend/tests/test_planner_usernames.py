"""Planner shows another user's duel username when they have one (#903)."""

from app.planner import share as share_svc
from app.group_buy import service as group_buy
from tests.conftest import add_deck_with_cards, make_user


def _member_names(detail):
    return {m.user_id: m.display_name for m in detail.members}


def test_group_buy_member_and_host_names_use_duel_username_903(db):
    host = make_user(db, email="h903@example.com", name="Miko Real", sub="sub-h903")
    plain = make_user(db, email="p903@example.com", name="No Handle", sub="sub-p903")
    host.username = "mikoduel"
    db.commit()
    created = group_buy.create_group_buy(db, host, "Names")
    group_buy.join_group_buy(db, plain, created.invite_token)

    detail = group_buy.public_group_buy_view(db, created.invite_token)
    names = _member_names(detail)
    assert names[host.id] == "mikoduel"
    # No username: the account name, as before.
    assert names[plain.id] == "No Handle"
    assert detail.host_name == "mikoduel"
    assert group_buy.invite_preview(db, created.invite_token).host_name == "mikoduel"


def test_share_link_owner_name_uses_duel_username_903(db):
    owner = make_user(db, email="o903@example.com", name="Owner Real", sub="sub-o903")
    deck = add_deck_with_cards(db, owner, "A", {"OP01-016": 1})
    link = share_svc.create_or_update_share(db, owner, "deck", deck.id)
    assert share_svc.public_share_view(db, link.token).owner_name == "Owner Real"
    owner.username = "ownerduel"
    db.commit()
    assert share_svc.public_share_view(db, link.token).owner_name == "ownerduel"
