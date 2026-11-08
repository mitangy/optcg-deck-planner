from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.core.auth import get_current_user
from app.core.config import get_settings
from app.core.db import get_db
from app.main import app
from app.planner.models import ScanSample
from app.routers import scan_samples
from tests.conftest import make_user

JPEG = b"\xff\xd8\xff\xe0" + b"x" * 100
TOKEN = "scan-secret"


def _b64(data: bytes) -> str:
    return "data:image/jpeg;base64," + base64.b64encode(data).decode()


def _item(**over):
    item = {
        "image": _b64(JPEG),
        "predicted_id": "OP01-120",
        "confidence": "sure",
        "final_id": "OP01-120",
        "label": "confirmed",
    }
    item.update(over)
    return item


@pytest.fixture()
def client(db):
    user = make_user(db, email="a@example.com", name="A", sub="sub-a")
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_settings] = lambda: SimpleNamespace(scan_training_token=TOKEN)
    c = TestClient(app)
    c.user = user
    yield c
    app.dependency_overrides.clear()


def _post(client, *items):
    return client.post("/scan-samples", json={"items": list(items)})


def test_sharing_is_on_by_default_and_the_preference_turns_it_off_852(client, db):
    assert db.get(type(client.user), client.user.id).share_scans is True
    res = client.patch("/preferences", json={"share_scans": False})
    assert res.status_code == 200
    assert res.json()["share_scans"] is False
    assert client.patch("/preferences", json={"sum_across_leaders": True}).json()["share_scans"] is False


def test_uploads_are_refused_when_the_user_turned_sharing_off_852(client, db):
    client.user.share_scans = False
    db.commit()
    res = _post(client, _item())
    assert res.status_code == 403
    assert db.query(ScanSample).count() == 0


def test_only_small_jpegs_are_accepted_and_one_bad_image_rejects_the_batch_852(client, db):
    png = _post(client, _item(), _item(image=_b64(b"\x89PNG" + b"x" * 50)))
    big = _post(client, _item(image=_b64(JPEG + b"x" * scan_samples.MAX_IMAGE_BYTES)))
    good = _b64(JPEG)
    junk = _post(client, _item(image=good[:30] + "@@" + good[30:]))
    assert (png.status_code, big.status_code, junk.status_code) == (400, 400, 400)
    assert db.query(ScanSample).count() == 0


def test_card_ids_must_look_like_card_numbers_852(client, db):
    assert _post(client, _item(final_id="not a card")).status_code == 400
    assert _post(client, _item(predicted_id="zzz")).status_code == 400
    assert db.query(ScanSample).count() == 0


def test_saved_rows_carry_the_normalised_ids_and_label_852(client, db):
    res = _post(client, _item(predicted_id=" op01-001 ", final_id=" st10-001 ", confidence="check", label="corrected"),
                _item(predicted_id=None, confidence="none", final_id="P-001"))
    assert res.json() == {"saved": 2}
    rows = db.query(ScanSample).order_by(ScanSample.id).all()
    assert [(r.predicted_id, r.final_id, r.confidence, r.label) for r in rows] == [
        ("OP01-001", "ST10-001", "check", "corrected"),
        (None, "P-001", "none", "confirmed"),
    ]
    assert rows[0].user_id == client.user.id
    assert rows[0].data == JPEG and rows[0].size == len(JPEG) and rows[0].mime == "image/jpeg"


def test_one_draw_in_five_lands_in_the_test_split_852(client, db, monkeypatch):
    draws = iter([0, 1])
    monkeypatch.setattr(scan_samples.secrets, "randbelow", lambda n: (n, next(draws))[1])
    _post(client, _item(), _item())
    assert [r.split for r in db.query(ScanSample).order_by(ScanSample.id)] == ["test", "train"]


def test_the_daily_cap_counts_only_the_last_24_hours_852(client, db, monkeypatch):
    monkeypatch.setattr(scan_samples, "DAILY_CAP_PER_USER", 3)
    db.add(ScanSample(user_id=client.user.id, final_id="OP01-001", confidence="sure", label="confirmed",
                      split="train", mime="image/jpeg", data=JPEG, size=1,
                      created_at=datetime.now(timezone.utc) - timedelta(days=2)))
    db.commit()
    assert _post(client, _item(), _item(), _item()).status_code == 200
    over = _post(client, _item())
    assert over.status_code == 429
    assert db.query(ScanSample).count() == 4


def test_old_rows_are_pruned_on_upload_852(client, db):
    db.add(ScanSample(user_id=client.user.id, final_id="OP01-001", confidence="sure", label="confirmed",
                      split="train", mime="image/jpeg", data=JPEG, size=1,
                      created_at=datetime.now(timezone.utc) - timedelta(days=scan_samples.MAX_AGE_DAYS + 1)))
    db.add(ScanSample(user_id=client.user.id, final_id="OP01-002", confidence="sure", label="confirmed",
                      split="train", mime="image/jpeg", data=JPEG, size=1,
                      created_at=datetime.now(timezone.utc) - timedelta(days=scan_samples.MAX_AGE_DAYS - 1)))
    db.commit()
    _post(client, _item())
    assert sorted(r.final_id for r in db.query(ScanSample)) == ["OP01-002", "OP01-120"]


def test_the_oldest_rows_go_first_when_storage_is_over_the_cap_852(client, db, monkeypatch):
    monkeypatch.setattr(scan_samples, "MAX_TOTAL_BYTES", len(JPEG) * 2)
    _post(client, _item(final_id="OP01-001"), _item(final_id="OP01-002"))
    _post(client, _item(final_id="OP01-003"))
    assert sorted(r.final_id for r in db.query(ScanSample)) == ["OP01-002", "OP01-003"]


def _export(client, token=TOKEN, **params):
    headers = {} if token is None else {"X-Scan-Training-Token": token}
    return client.get("/scan-samples/export", params=params, headers=headers)


def test_export_needs_the_training_token_852(client):
    _post(client, _item())
    assert _export(client).status_code == 200
    assert _export(client, token="wrong").status_code == 401
    assert _export(client, token=None).status_code == 401
    app.dependency_overrides[get_settings] = lambda: SimpleNamespace(scan_training_token="")
    assert _export(client, token="").status_code == 401


def test_export_pages_by_after_id_without_user_details_852(client, db):
    _post(client, *[_item(final_id=f"OP01-00{i}") for i in range(1, 4)])
    first = _export(client, limit=2).json()
    assert [i["final_id"] for i in first["items"]] == ["OP01-001", "OP01-002"]
    second = _export(client, after_id=first["next_after_id"], limit=2).json()
    assert [i["final_id"] for i in second["items"]] == ["OP01-003"]
    assert _export(client, after_id=second["next_after_id"]).json() == {"items": [], "next_after_id": second["next_after_id"]}
    item = first["items"][0]
    assert set(item) == {"id", "split", "final_id", "predicted_id", "confidence", "label", "image_b64"}
    assert base64.b64decode(item["image_b64"]) == JPEG


def test_export_caps_the_page_size_852(client, monkeypatch):
    monkeypatch.setattr(scan_samples, "EXPORT_MAX_LIMIT", 1)
    _post(client, _item(), _item())
    assert len(_export(client, limit=50).json()["items"]) == 1


def test_users_can_count_and_delete_only_their_own_samples_852(client, db):
    other = make_user(db, email="b@example.com", name="B", sub="sub-b")
    db.add(ScanSample(user_id=other.id, final_id="OP01-001", confidence="sure", label="confirmed",
                      split="train", mime="image/jpeg", data=JPEG, size=1))
    db.commit()
    _post(client, _item(), _item())
    assert client.get("/scan-samples/mine").json() == {"count": 2}
    assert client.delete("/scan-samples/mine").json() == {"deleted": 2}
    assert client.get("/scan-samples/mine").json() == {"count": 0}
    assert [r.user_id for r in db.query(ScanSample)] == [other.id]
