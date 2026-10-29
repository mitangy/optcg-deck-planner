"""Player reports, warnings and image takedowns (#810)."""

from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app.auth import SESSION_COOKIE, create_session_token
from app.config import get_settings
from app.db import get_db
from app.game_tokens import mint_game_token
from app.main import app
from app.models import (
    DuelCosmetic,
    DuelMatch,
    DuelMatchProgress,
    DuelPresence,
    DuelUserSettings,
    Friendship,
    PlayerReport,
    PlayerWarning,
    User,
)
from tests.db_support import make_test_engine

INGEST = {"X-Duel-Ingest-Token": "test-ingest"}
JPEG = b"\xff\xd8\xff\xe0" + b"jpeg-bytes"
PNG = b"\x89PNG\r\n\x1a\n" + b"png-bytes"


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret")
    monkeypatch.setenv("GAME_TOKEN_SECRET", "test-game-token")
    monkeypatch.setenv("DUEL_INGEST_SECRET", "test-ingest")
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

    app.dependency_overrides[get_db] = _override_db
    with TestClient(app) as c:
        yield c, SessionLocal
    app.dependency_overrides.clear()
    get_settings.cache_clear()


def user(S, name: str, role: str = "user") -> int:
    with S() as db:
        u = User(email=f"{name}@x.test", name=name, google_sub=f"sub-{name}", username=name, role=role)
        db.add(u)
        db.commit()
        return u.id


def as_user(c: TestClient, uid: int) -> TestClient:
    c.cookies.clear()
    c.cookies.set(SESSION_COOKIE, create_session_token(uid, 0))
    return c


def befriend(S, a: int, b: int, status: str = "accepted") -> None:
    with S() as db:
        db.add(Friendship(user_low_id=min(a, b), user_high_id=max(a, b), requester_id=a, status=status))
        db.commit()


def finished_match(S, match_id: str, seat0: int, seat1: int) -> None:
    with S() as db:
        db.add(
            DuelMatch(
                match_id=match_id, seat0_user_id=seat0, seat1_user_id=seat1, winner_seat=0,
                seat0_rating_before=1000, seat1_rating_before=1000, seat0_rating_after=1010, seat1_rating_after=990,
            )
        )
        db.commit()


def spectate(S, uid: int, room: str) -> None:
    with S() as db:
        db.add(DuelPresence(user_id=uid, room_id=room, instance_id="gs-1", role="spectator", updated_at=datetime.now(timezone.utc)))
        db.commit()


def upload(c: TestClient, uid: int, kind: str, data: bytes = JPEG) -> dict:
    """Upload as ``uid``; returns the new item (id + public_path)."""
    res = as_user(c, uid).post(f"/duel/cosmetics/{kind}", content=data)
    assert res.status_code == 201, res.text
    return max(res.json()["items"], key=lambda i: i["id"])


def report(c: TestClient, uid: int, **body):
    body.setdefault("reason", "conduct")
    body.setdefault("source", "match")
    return as_user(c, uid).post("/duel/reports", json=body)


def seat_report(c: TestClient, uid: int, match_id: str, seat: int, **extra):
    return report(c, uid, match_id=match_id, reported_seat=seat, **extra)


def stored(S, report_id: int) -> PlayerReport:
    with S() as db:
        row = db.get(PlayerReport, report_id)
        db.expunge(row)
        return row


def test_anonymous_cannot_report_810(client):
    c, S = client
    luffy, zoro = user(S, "Luffy"), user(S, "Zoro")
    finished_match(S, "m1", luffy, zoro)
    c.cookies.clear()
    assert c.post("/duel/reports", json={"reason": "toxic", "source": "match", "match_id": "m1", "reported_seat": 1}).status_code == 401


def test_banned_game_token_holder_cannot_report_810(client):
    c, S = client
    luffy, zoro = user(S, "Luffy"), user(S, "Zoro")
    finished_match(S, "m1", luffy, zoro)
    with S() as db:
        db.get(User, luffy).banned_at = datetime.now(timezone.utc)
        db.commit()
    token = mint_game_token(user_id=luffy, email="Luffy@x.test")["token"]
    c.cookies.clear()
    res = c.post(
        "/duel/reports",
        json={"reason": "toxic", "source": "match", "match_id": "m1", "reported_seat": 1},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 403


def test_game_token_holder_can_report_810(client):
    c, S = client
    luffy, zoro = user(S, "Luffy"), user(S, "Zoro")
    finished_match(S, "m1", luffy, zoro)
    token = mint_game_token(user_id=luffy, email="Luffy@x.test")["token"]
    c.cookies.clear()
    res = c.post(
        "/duel/reports",
        json={"reason": "toxic", "source": "match", "match_id": "m1", "reported_seat": 1},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 201, res.text
    assert (stored(S, res.json()["id"]).reporter_id, stored(S, res.json()["id"]).reported_id) == (luffy, zoro)


def test_reporting_yourself_is_refused_810(client):
    c, S = client
    luffy, zoro = user(S, "Luffy"), user(S, "Zoro")
    finished_match(S, "m1", luffy, zoro)
    befriend(S, luffy, zoro)
    assert seat_report(c, luffy, "m1", 0).status_code == 400
    assert report(c, luffy, source="friends", reported_user_id=luffy).status_code == 400
    with S() as db:
        assert db.query(PlayerReport).count() == 0


def test_the_reported_seat_comes_from_the_finished_match_810(client):
    c, S = client
    luffy, zoro = user(S, "Luffy"), user(S, "Zoro")
    finished_match(S, "m1", luffy, zoro)
    upload(c, luffy, "playmat", JPEG)
    # Zoro (seat 1) reports seat 0: the report lands on Luffy, not on a fixed side.
    res = seat_report(c, zoro, "m1", 0, reason="toxic", note="  rude  ", image_kind="playmat")
    assert res.status_code == 201, res.text
    assert res.json() == {"id": res.json()["id"], "duplicate": False}
    row = stored(S, res.json()["id"])
    assert (row.reporter_id, row.reported_id, row.reason, row.note, row.match_id, row.status) == (
        zoro, luffy, "toxic", "rude", "m1", "open",
    )
    # Only an image report keeps an image kind or a snapshot.
    assert (row.image_kind, row.image_data) == (None, None)


def test_the_reported_seat_comes_from_an_unfinished_game_810(client):
    c, S = client
    luffy, zoro = user(S, "Luffy"), user(S, "Zoro")
    with S() as db:
        db.add(DuelMatchProgress(match_id="live1", seat0_user_id=luffy, seat1_user_id=zoro, updated_at=datetime.now(timezone.utc)))
        db.commit()
    res = seat_report(c, luffy, "live1", 1)
    assert res.status_code == 201, res.text
    assert stored(S, res.json()["id"]).reported_id == zoro


def test_unknown_match_or_bot_seat_is_player_not_found_810(client):
    c, S = client
    luffy = user(S, "Luffy")
    finished_match(S, "vsbot", luffy, -1)
    assert seat_report(c, luffy, "nope", 1).status_code == 404
    assert seat_report(c, luffy, "vsbot", 1).status_code == 404
    assert report(c, luffy, source="friends", reported_user_id=99999).status_code == 404


def test_only_players_and_spectators_of_the_match_can_report_it_810(client):
    c, S = client
    luffy, zoro, nami, usopp = user(S, "Luffy"), user(S, "Zoro"), user(S, "Nami"), user(S, "Usopp")
    finished_match(S, "m1", luffy, zoro)
    assert seat_report(c, nami, "m1", 1).status_code == 403
    # Watching a different room is not enough.
    spectate(S, nami, "m2")
    assert seat_report(c, nami, "m1", 1).status_code == 403
    spectate(S, usopp, "m1")
    res = seat_report(c, usopp, "m1", 1, source="spectate")
    assert res.status_code == 201, res.text
    assert stored(S, res.json()["id"]).reported_id == zoro


def test_reporting_by_user_id_needs_an_accepted_friendship_810(client):
    c, S = client
    luffy, zoro, nami = user(S, "Luffy"), user(S, "Zoro"), user(S, "Nami")
    assert report(c, luffy, source="friends", reported_user_id=zoro).status_code == 403
    befriend(S, luffy, nami, status="pending")
    assert report(c, luffy, source="friends", reported_user_id=nami).status_code == 403
    befriend(S, luffy, zoro)
    res = report(c, luffy, source="friends", reported_user_id=zoro)
    assert res.status_code == 201, res.text
    assert stored(S, res.json()["id"]).reported_id == zoro


def test_a_report_must_say_which_player_and_an_image_report_which_kind_810(client):
    c, S = client
    luffy, zoro = user(S, "Luffy"), user(S, "Zoro")
    finished_match(S, "m1", luffy, zoro)
    assert report(c, luffy, source="match").status_code == 422
    assert seat_report(c, luffy, "m1", 1, reason="image").status_code == 422
    assert seat_report(c, luffy, "m1", 1, reason="image", image_kind="playmat").status_code == 201
    assert seat_report(c, luffy, "m1", 1, reason="conduct", surprise=1).status_code == 422


def test_the_reported_image_is_copied_and_survives_the_owner_deleting_it_810(client):
    c, S = client
    luffy, zoro = user(S, "Luffy"), user(S, "Zoro")
    finished_match(S, "m1", luffy, zoro)
    item = upload(c, zoro, "playmat", JPEG)
    # The client may send the link behind the absolute API base URL.
    res = seat_report(
        c, luffy, "m1", 1, reason="image", image_kind="playmat", image_src="https://api.example.test" + item["public_path"]
    )
    assert res.status_code == 201, res.text
    row = stored(S, res.json()["id"])
    assert (row.cosmetic_id, row.image_mime, row.image_data) == (item["id"], "image/jpeg", JPEG)
    assert as_user(c, zoro).delete(f"/duel/cosmetics/{item['id']}").status_code == 200
    assert stored(S, row.id).image_data == JPEG


def test_a_link_to_someone_elses_image_or_a_forged_one_is_not_copied_810(client):
    c, S = client
    luffy, zoro, nami = user(S, "Luffy"), user(S, "Zoro"), user(S, "Nami")
    theirs = upload(c, nami, "playmat", PNG)
    older = upload(c, zoro, "playmat", PNG + b"older")
    active = upload(c, zoro, "playmat", JPEG)  # the newest upload is the active one
    forged = older["public_path"].rsplit("/", 1)[0] + "/" + "x" * 32
    for n, src in enumerate((theirs["public_path"], forged)):
        finished_match(S, f"m{n}", luffy, zoro)
        res = seat_report(c, luffy, f"m{n}", 1, reason="image", image_kind="playmat", image_src=src)
        row = stored(S, res.json()["id"])
        # Neither link proves what the reporter saw, so the reported player's active playmat is copied.
        assert (row.cosmetic_id, row.image_data) == (active["id"], JPEG)


def test_a_link_to_the_wrong_kind_of_image_is_not_copied_810(client):
    c, S = client
    luffy, zoro = user(S, "Luffy"), user(S, "Zoro")
    finished_match(S, "m1", luffy, zoro)
    mat = upload(c, zoro, "playmat", JPEG)
    res = seat_report(c, luffy, "m1", 1, reason="image", image_kind="cardBack", image_src=mat["public_path"])
    row = stored(S, res.json()["id"])
    assert (row.cosmetic_id, row.image_data) == (None, None)


def test_a_data_url_is_stored_when_it_is_an_image_810(client):
    c, S = client
    luffy, zoro = user(S, "Luffy"), user(S, "Zoro")
    finished_match(S, "m1", luffy, zoro)
    good = "data:image/png;base64," + base64.b64encode(PNG).decode()
    res = seat_report(c, luffy, "m1", 1, reason="image", image_kind="cardBack", image_src=good)
    row = stored(S, res.json()["id"])
    assert (row.cosmetic_id, row.image_mime, row.image_data) == (None, "image/png", PNG)
    # Bytes that are not an image are dropped, not stored.
    fake = "data:image/png;base64," + base64.b64encode(b"<svg onload=alert(1)>").decode()
    finished_match(S, "m2", luffy, zoro)
    res = seat_report(c, luffy, "m2", 1, reason="image", image_kind="playmat", image_src=fake)
    assert res.status_code == 201
    assert stored(S, res.json()["id"]).image_data is None


def test_without_a_usable_source_the_active_image_of_that_kind_is_copied_810(client):
    c, S = client
    luffy, zoro = user(S, "Luffy"), user(S, "Zoro")
    finished_match(S, "m1", luffy, zoro)
    mat = upload(c, zoro, "playmat", JPEG)
    upload(c, zoro, "cardBack", PNG)
    res = seat_report(c, luffy, "m1", 1, reason="image", image_kind="playmat", image_src="/assets/default-mat.jpg")
    row = stored(S, res.json()["id"])
    assert (row.cosmetic_id, row.image_data) == (mat["id"], JPEG)


def test_an_image_report_against_a_player_with_no_image_is_still_saved_810(client):
    c, S = client
    luffy, zoro = user(S, "Luffy"), user(S, "Zoro")
    finished_match(S, "m1", luffy, zoro)
    res = seat_report(c, luffy, "m1", 1, reason="image", image_kind="playmat")
    assert res.status_code == 201
    assert stored(S, res.json()["id"]).image_data is None


def test_a_repeat_report_returns_the_open_one_instead_of_adding_a_row_810(client):
    c, S = client
    luffy, zoro = user(S, "Luffy"), user(S, "Zoro")
    finished_match(S, "m1", luffy, zoro)
    first = seat_report(c, luffy, "m1", 1, reason="toxic")
    again = seat_report(c, luffy, "m1", 1, reason="toxic")
    assert (first.status_code, again.status_code) == (201, 200)
    assert again.json() == {"id": first.json()["id"], "duplicate": True}
    # A different reason, or another reporter, is its own report.
    assert seat_report(c, luffy, "m1", 1, reason="conduct").json()["duplicate"] is False
    spectate(S, user(S, "Nami"), "m1")
    with S() as db:
        nami = db.query(User).filter_by(username="Nami").one().id
    assert seat_report(c, nami, "m1", 1, reason="toxic").json()["duplicate"] is False
    with S() as db:
        assert db.query(PlayerReport).count() == 3


def test_an_old_report_does_not_count_as_a_duplicate_810(client):
    c, S = client
    luffy, zoro = user(S, "Luffy"), user(S, "Zoro")
    finished_match(S, "m1", luffy, zoro)
    first = seat_report(c, luffy, "m1", 1)
    with S() as db:
        db.get(PlayerReport, first.json()["id"]).created_at = datetime.now(timezone.utc) - timedelta(hours=25)
        db.commit()
    assert seat_report(c, luffy, "m1", 1).json()["duplicate"] is False


def test_a_player_can_file_ten_reports_an_hour_810(client):
    c, S = client
    luffy = user(S, "Luffy")
    others = [user(S, f"Rival{i}") for i in range(11)]
    for i, other in enumerate(others):
        finished_match(S, f"m{i}", luffy, other)
    codes = [seat_report(c, luffy, f"m{i}", 1).status_code for i in range(11)]
    assert codes == [201] * 10 + [429]


def test_a_taken_down_image_is_gone_for_everyone_but_kept_as_evidence_810(client):
    c, S = client
    zoro = user(S, "Zoro")
    mod = user(S, "Mod", role="moderator")
    item = upload(c, zoro, "playmat", JPEG)
    other = upload(c, zoro, "playmat", PNG)
    public = item["public_path"]
    assert c.get(public).status_code == 200
    luffy = user(S, "Luffy")
    finished_match(S, "m1", luffy, zoro)
    # Zoro's active playmat is now `other`; point it at the reported one.
    as_user(c, zoro).put("/duel/cosmetics/active", json={"kind": "playmat", "id": item["id"]})
    rid = seat_report(c, luffy, "m1", 1, reason="image", image_kind="playmat", image_src=public).json()["id"]

    res = as_user(c, mod).post(f"/admin/reports/{rid}/remove-image", json={"note": "nsfw"})
    assert res.status_code == 200, res.text
    assert (res.json()["status"], res.json()["action"], res.json()["image_taken_down"]) == ("actioned", "image_removed", True)

    c.cookies.clear()
    assert c.get(public).status_code == 404
    owner = as_user(c, zoro)
    assert owner.get(f"/duel/cosmetics/{item['id']}/image").status_code == 404
    listing = owner.get("/duel/cosmetics").json()
    assert [i["id"] for i in listing["items"]] == [other["id"]]
    assert listing["active"]["playmat"] is None
    assert owner.delete(f"/duel/cosmetics/{item['id']}").status_code == 404
    assert owner.put("/duel/cosmetics/active", json={"kind": "playmat", "id": item["id"]}).status_code == 404
    with S() as db:
        row = db.get(DuelCosmetic, item["id"])
        assert row is not None and row.data == JPEG and row.taken_down_by == mod
        assert db.get(DuelUserSettings, zoro).active_playmat_id is None


def test_new_uploads_never_prune_a_taken_down_image_810(client):
    c, S = client
    zoro = user(S, "Zoro")
    evidence = upload(c, zoro, "cardBack", PNG)
    with S() as db:
        from app.moderation import take_down_cosmetic

        take_down_cosmetic(db, db.get(DuelCosmetic, evidence["id"]), None, "test")
        db.commit()
    for _ in range(14):
        upload(c, zoro, "cardBack", JPEG)
    with S() as db:
        assert db.get(DuelCosmetic, evidence["id"]) is not None


def test_removing_an_image_closes_the_other_open_reports_of_it_810(client):
    c, S = client
    luffy, zoro, nami, usopp = user(S, "Luffy"), user(S, "Zoro"), user(S, "Nami"), user(S, "Usopp")
    admin = user(S, "Boss", role="admin")
    finished_match(S, "m1", luffy, zoro)
    spectate(S, nami, "m1")
    spectate(S, usopp, "m1")
    item = upload(c, zoro, "cardBack", PNG)
    r_done = seat_report(c, usopp, "m1", 1, reason="image", image_kind="cardBack", image_src=item["public_path"]).json()["id"]
    as_user(c, admin).post(f"/admin/reports/{r_done}/dismiss", json={"note": "looked fine"})
    r1 = seat_report(c, luffy, "m1", 1, reason="image", image_kind="cardBack", image_src=item["public_path"]).json()["id"]
    r2 = seat_report(c, nami, "m1", 1, reason="image", image_kind="cardBack", image_src=item["public_path"]).json()["id"]
    r3 = seat_report(c, luffy, "m1", 1, reason="toxic").json()["id"]
    as_user(c, admin).post(f"/admin/reports/{r1}/remove-image", json={})
    assert [stored(S, i).action for i in (r1, r2, r3)] == ["image_removed", "image_removed", ""]
    assert stored(S, r3).status == "open"
    # A report someone already handled is left as they decided it.
    assert (stored(S, r_done).status, stored(S, r_done).action, stored(S, r_done).staff_note) == ("dismissed", "", "looked fine")
    # Handled reports cannot be acted on again.
    assert as_user(c, admin).post(f"/admin/reports/{r1}/dismiss", json={}).status_code == 409


def test_remove_image_without_any_image_is_a_conflict_810(client):
    c, S = client
    luffy, zoro = user(S, "Luffy"), user(S, "Zoro")
    admin = user(S, "Boss", role="admin")
    finished_match(S, "m1", luffy, zoro)
    rid = seat_report(c, luffy, "m1", 1, reason="image", image_kind="playmat").json()["id"]
    assert as_user(c, admin).post(f"/admin/reports/{rid}/remove-image", json={}).status_code == 409
    assert stored(S, rid).status == "open"


def test_a_moderator_cannot_warn_or_ban_a_moderator_but_can_a_player_810(client):
    c, S = client
    luffy = user(S, "Luffy")
    mod, other_mod = user(S, "Mod", role="moderator"), user(S, "Mod2", role="moderator")
    player = user(S, "Zoro")
    finished_match(S, "m1", luffy, other_mod)
    finished_match(S, "m2", luffy, player)
    r_mod = seat_report(c, luffy, "m1", 1).json()["id"]
    r_user = seat_report(c, luffy, "m2", 1).json()["id"]
    as_user(c, mod)
    assert c.post(f"/admin/reports/{r_mod}/warn", json={"message": "stop"}).status_code == 403
    assert c.post(f"/admin/reports/{r_mod}/ban", json={"reason": "x"}).status_code == 403
    with S() as db:
        assert db.get(User, other_mod).banned_at is None
        assert db.query(PlayerWarning).count() == 0
    assert stored(S, r_mod).status == "open"

    warned = c.post(f"/admin/reports/{r_user}/warn", json={"message": "Please follow the Rules of conduct."})
    assert warned.status_code == 200, warned.text
    assert (warned.json()["status"], warned.json()["action"], warned.json()["handled_by_name"]) == ("actioned", "warned", "Mod")
    r2 = seat_report(c, luffy, "m2", 1, reason="toxic").json()["id"]
    banned = as_user(c, mod).post(f"/admin/reports/{r2}/ban", json={"reason": "slurs"})
    assert banned.status_code == 200, banned.text
    assert (banned.json()["action"], banned.json()["reported"]["banned"]) == ("banned", True)
    with S() as db:
        target = db.get(User, player)
        assert (target.ban_reason, target.banned_by) == ("slurs", mod)


def test_reports_are_for_staff_only_810(client):
    c, S = client
    luffy = user(S, "Luffy")
    as_user(c, luffy)
    assert c.get("/admin/reports").status_code == 403
    assert c.post("/admin/reports/1/dismiss", json={}).status_code == 403
    assert c.get("/admin/reports/1/image").status_code == 403
    assert c.post("/admin/cosmetics/1/restore").status_code == 403


def test_admin_report_list_has_names_counts_and_links_810(client):
    c, S = client
    luffy, zoro = user(S, "Luffy"), user(S, "Zoro")
    admin = user(S, "Boss", role="admin")
    finished_match(S, "m1", luffy, zoro)
    item = upload(c, zoro, "playmat", JPEG)
    r_img = seat_report(c, luffy, "m1", 1, reason="image", image_kind="playmat", image_src=item["public_path"], note="nsfw").json()["id"]
    r_old = seat_report(c, luffy, "m1", 1, reason="toxic").json()["id"]
    as_user(c, admin).post(f"/admin/reports/{r_old}/warn", json={"message": "careful"})

    rows = c.get("/admin/reports").json()["reports"]
    assert [r["id"] for r in rows] == [r_img]
    row = rows[0]
    assert row["reporter"] == {"id": luffy, "name": "Luffy"}
    assert row["reported"] == {
        "id": zoro, "name": "Zoro", "role": "user", "banned": False,
        "open_reports": 1, "total_reports": 2, "warnings": 1,
    }
    assert (row["reason"], row["image_kind"], row["note"], row["match_id"], row["source"]) == ("image", "playmat", "nsfw", "m1", "match")
    assert (row["status"], row["action"], row["handled_by_name"], row["handled_at"]) == ("open", "", None, None)
    assert (row["match_finished"], row["has_image"], row["cosmetic_id"], row["image_taken_down"]) == (True, True, item["id"], False)

    everything = c.get("/admin/reports", params={"status": "all"}).json()["reports"]
    assert [r["id"] for r in everything] == [r_old, r_img]
    assert everything[0]["handled_by_name"] == "Boss"
    assert (everything[0]["has_image"], everything[1]["has_image"]) == (False, True)

    snap = c.get(f"/admin/reports/{r_img}/image")
    assert (snap.status_code, snap.content, snap.headers["cache-control"]) == (200, JPEG, "no-store")
    assert c.get(f"/admin/reports/{r_old}/image").status_code == 404


def test_a_report_of_a_game_without_a_result_is_not_marked_finished_810(client):
    c, S = client
    luffy, zoro = user(S, "Luffy"), user(S, "Zoro")
    admin = user(S, "Boss", role="admin")
    with S() as db:
        db.add(DuelMatchProgress(match_id="live1", seat0_user_id=luffy, seat1_user_id=zoro, updated_at=datetime.now(timezone.utc)))
        db.commit()
    seat_report(c, luffy, "live1", 1)
    assert as_user(c, admin).get("/admin/reports").json()["reports"][0]["match_finished"] is False


def test_dismissing_keeps_the_staff_note_and_closes_the_report_810(client):
    c, S = client
    luffy, zoro = user(S, "Luffy"), user(S, "Zoro")
    mod = user(S, "Mod", role="moderator")
    finished_match(S, "m1", luffy, zoro)
    rid = seat_report(c, luffy, "m1", 1).json()["id"]
    res = as_user(c, mod).post(f"/admin/reports/{rid}/dismiss", json={"note": "not an issue"})
    assert (res.json()["status"], res.json()["staff_note"], res.json()["action"]) == ("dismissed", "not an issue", "")
    assert as_user(c, mod).get("/admin/reports").json()["reports"] == []
    # Once handled, the same player can report again: it is not a duplicate of a closed report.
    again = seat_report(c, luffy, "m1", 1)
    assert (again.status_code, again.json()["duplicate"]) == (201, False)


def test_warnings_are_listed_oldest_first_and_acknowledged_by_their_owner_810(client):
    c, S = client
    luffy, zoro = user(S, "Luffy"), user(S, "Zoro")
    with S() as db:
        a = PlayerWarning(user_id=zoro, message="first")
        b = PlayerWarning(user_id=zoro, message="second")
        mine = PlayerWarning(user_id=luffy, message="not zoro's")
        db.add_all([a, b, mine])
        db.commit()
        ids = (a.id, b.id, mine.id)
    as_user(c, zoro)
    assert [w["message"] for w in c.get("/duel/warnings").json()] == ["first", "second"]
    assert set(c.get("/duel/warnings").json()[0]) == {"id", "message", "created_at"}
    assert c.post(f"/duel/warnings/{ids[2]}/ack").status_code == 404
    assert c.post(f"/duel/warnings/{ids[0]}/ack").status_code == 204
    assert [w["message"] for w in c.get("/duel/warnings").json()] == ["second"]
    assert [w["message"] for w in as_user(c, luffy).get("/duel/warnings").json()] == ["not zoro's"]
    c.cookies.clear()
    assert c.get("/duel/warnings").status_code == 401


def test_presence_answers_with_images_taken_down_in_the_last_quarter_hour_810(client, fake_redis):
    c, S = client
    zoro = user(S, "Zoro")
    fresh, stale = upload(c, zoro, "playmat", JPEG), upload(c, zoro, "cardBack", PNG)
    live = upload(c, zoro, "cardBack", JPEG)
    mod = user(S, "Mod", role="moderator")
    from app.moderation import take_down_cosmetic

    with S() as db:
        take_down_cosmetic(db, db.get(DuelCosmetic, fresh["id"]), mod, "x")
        take_down_cosmetic(db, db.get(DuelCosmetic, stale["id"]), mod, "x")
        db.get(DuelCosmetic, stale["id"]).taken_down_at = datetime.now(timezone.utc) - timedelta(minutes=16)
        db.commit()
    c.cookies.clear()
    res = c.put("/duel/presence", json={"instance_id": "gs-1", "entries": []}, headers=INGEST)
    assert res.status_code == 200
    assert res.json() == {"takedowns": [{"user_id": zoro, "kind": "playmat", "cosmetic_id": fresh["id"]}]}
    assert live["id"] not in [t["cosmetic_id"] for t in res.json()["takedowns"]]


def test_presence_reports_takedowns_without_redis_too_810(client):
    c, S = client
    zoro = user(S, "Zoro")
    item = upload(c, zoro, "playmat", JPEG)
    from app.moderation import take_down_cosmetic

    with S() as db:
        take_down_cosmetic(db, db.get(DuelCosmetic, item["id"]), None, "x")
        db.commit()
    c.cookies.clear()
    res = c.put("/duel/presence", json={"instance_id": "gs-1", "entries": []}, headers=INGEST)
    assert res.json()["takedowns"] == [{"user_id": zoro, "kind": "playmat", "cosmetic_id": item["id"]}]


def test_only_the_admin_can_restore_a_taken_down_image_810(client):
    c, S = client
    zoro = user(S, "Zoro")
    mod, admin = user(S, "Mod", role="moderator"), user(S, "Boss", role="admin")
    item = upload(c, zoro, "playmat", JPEG)
    from app.moderation import take_down_cosmetic

    with S() as db:
        take_down_cosmetic(db, db.get(DuelCosmetic, item["id"]), mod, "x")
        db.commit()
    assert as_user(c, mod).post(f"/admin/cosmetics/{item['id']}/restore").status_code == 403
    assert as_user(c, admin).post(f"/admin/cosmetics/{item['id']}/restore").status_code == 200
    listing = as_user(c, zoro).get("/duel/cosmetics").json()
    assert [i["id"] for i in listing["items"]] == [item["id"]]
    # Restoring does not switch it back on.
    assert listing["active"]["playmat"] is None
    assert as_user(c, admin).post("/admin/cosmetics/9999/restore").status_code == 404


def test_removing_the_image_of_a_report_with_no_link_takes_down_the_active_one_810(client):
    c, S = client
    luffy, zoro = user(S, "Luffy"), user(S, "Zoro")
    admin = user(S, "Boss", role="admin")
    finished_match(S, "m1", luffy, zoro)
    mat = upload(c, zoro, "playmat", JPEG)
    shown = "data:image/png;base64," + base64.b64encode(PNG).decode()
    rid = seat_report(c, luffy, "m1", 1, reason="image", image_kind="playmat", image_src=shown).json()["id"]
    assert stored(S, rid).cosmetic_id is None
    assert as_user(c, admin).post(f"/admin/reports/{rid}/remove-image", json={}).status_code == 200
    with S() as db:
        assert db.get(DuelCosmetic, mat["id"]).taken_down_at is not None


def test_taking_down_the_active_card_back_clears_it_810(client):
    c, S = client
    zoro = user(S, "Zoro")
    item = upload(c, zoro, "cardBack", PNG)
    assert as_user(c, zoro).get("/duel/cosmetics").json()["active"]["cardBack"] == item["id"]
    from app.moderation import take_down_cosmetic

    with S() as db:
        take_down_cosmetic(db, db.get(DuelCosmetic, item["id"]), None, "x")
        db.commit()
    assert as_user(c, zoro).get("/duel/cosmetics").json()["active"]["cardBack"] is None


def test_taking_down_twice_keeps_the_first_decision_810(client):
    c, S = client
    zoro = user(S, "Zoro")
    first, second = user(S, "Mod", role="moderator"), user(S, "Mod2", role="moderator")
    item = upload(c, zoro, "playmat", JPEG)
    from app.moderation import take_down_cosmetic

    with S() as db:
        take_down_cosmetic(db, db.get(DuelCosmetic, item["id"]), first, "first reason")
        db.commit()
    with S() as db:
        take_down_cosmetic(db, db.get(DuelCosmetic, item["id"]), second, "second reason")
        db.commit()
    with S() as db:
        row = db.get(DuelCosmetic, item["id"])
        assert (row.taken_down_by, row.taken_down_reason) == (first, "first reason")


def test_reports_are_limited_per_address_and_across_everyone_810(client, monkeypatch: pytest.MonkeyPatch):
    from app.routers import reports

    c, S = client
    luffy = user(S, "Luffy")
    others = [user(S, f"Rival{i}") for i in range(4)]
    for i, other in enumerate(others):
        finished_match(S, f"m{i}", other, luffy)
    # Four different reporters from one address: the per-user budget never trips.
    monkeypatch.setattr(reports._ip_rate, "max_calls", 3)
    codes = [seat_report(c, other, f"m{i}", 1).status_code for i, other in enumerate(others)]
    assert codes == [201, 201, 201, 429]
    monkeypatch.setattr(reports._ip_rate, "max_calls", 100)
    monkeypatch.setattr(reports._global_rate, "max_calls", 3)
    assert seat_report(c, others[3], "m3", 1, reason="toxic").status_code == 429
