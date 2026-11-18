
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
    assert names[plain.id] == "Member 1"
    assert detail.host_name == "mikoduel"
    assert group_buy.invite_preview(db, created.invite_token).host_name == "mikoduel"
    assert group_buy.get_group_buy(db, host, created.id).members[1].display_name == "No Handle"


def test_public_group_buy_pages_hide_google_names_and_emails_1346(db):
    host = make_user(db, email="h1346@example.com", name="Host Real", sub="sub-h1346")
    a = make_user(db, email="a1346@example.com", name="Alice Real", sub="sub-a1346")
    b = make_user(db, email="b1346@example.com", name="Bob Real", sub="sub-b1346")
    created = group_buy.create_group_buy(db, host, "Names")
    group_buy.join_group_buy(db, a, created.invite_token)
    group_buy.join_group_buy(db, b, created.invite_token)
    a.username = "alicehandle"
    db.commit()

    detail = group_buy.public_group_buy_view(db, created.invite_token)
    assert _member_names(detail) == {host.id: "Host", a.id: "alicehandle", b.id: "Member 2"}
    assert detail.host_name == "Host"
    assert group_buy.invite_preview(db, created.invite_token).host_name == "Host"
    dump = detail.model_dump_json()
    for leaked in ("Real", "example.com"):
        assert leaked not in dump


def test_share_link_owner_name_uses_duel_username_903(db):
    owner = make_user(db, email="o903@example.com", name="Owner Real", sub="sub-o903")
    deck = add_deck_with_cards(db, owner, "A", {"OP01-016": 1})
    link = share_svc.create_or_update_share(db, owner, "deck", deck.id)
    assert share_svc.public_share_view(db, link.token).owner_name == "A collector"
    assert share_svc.public_share_view(db, link.token, owner).owner_name == "Owner Real"
    owner.username = "ownerduel"
    db.commit()
    assert share_svc.public_share_view(db, link.token).owner_name == "ownerduel"


def test_share_page_hides_owner_google_name_from_other_viewers_1346(db):
    owner = make_user(db, email="o1346@example.com", name="Owner Real", sub="sub-o1346")
    viewer = make_user(db, email="v1346@example.com", name="Viewer", sub="sub-v1346")
    deck = add_deck_with_cards(db, owner, "A", {"OP01-016": 1})
    link = share_svc.create_or_update_share(db, owner, "deck", deck.id)
    for who in (None, viewer):
        view = share_svc.public_share_view(db, link.token, who)
        assert view.owner_name == "A collector"
        assert "o1346" not in view.model_dump_json()
