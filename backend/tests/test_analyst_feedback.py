"""Player feedback on Log Pose answers: 👍 / 👎 / "This is wrong" (#679)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.auth import SESSION_COOKIE, create_session_token
from app.config import get_settings
from app.models import AnalystFeedback, AnalystMessage, AnalystThread, User
from tests.test_analyst import analyst  # noqa: F401  (fixture)
from tests.test_analyst_chat import _as, _session, chat  # noqa: F401  (fixture)
from tests.test_analyst_stats import SERVICE, _users
from tests.test_duel import client  # noqa: F401  (fixture)
from tests.test_duel import _ingest

ADMIN_EMAIL = "gamefreakmichaeltang@gmail.com"


def _thread(c, h, answers=("Play Zoro on turn 2.", "Keep the Nami.")) -> int:
    tid = c.post("/analyst/chat/threads", json={"title": "Zoro"}, headers=h).json()["id"]
    messages = []
    for i, a in enumerate(answers):
        messages.append({"role": "user", "content": [{"type": "text", "text": f"Question {i}?"}]})
        messages.append({"role": "assistant", "content": [{"type": "text", "text": a}]})
    assert c.post(f"/analyst/chat/threads/{tid}/messages", json={"messages": messages}, headers=h).status_code == 204
    return tid


def _rate(c, tid, index, rating="up", note=""):
    return c.post("/analyst/feedback", json={"kind": "chat", "thread_id": tid, "message_index": index, "rating": rating, "note": note})


def _mk_user(S, email: str, role: str = "user") -> int:
    with S() as db:
        u = User(email=email, name=email.split("@")[0], google_sub=f"sub-{email}", role=role)
        db.add(u)
        db.commit()
        return u.id


def _login(c, S, uid: int) -> None:
    with S() as db:
        sv = db.get(User, uid).session_version
    c.cookies.clear()
    c.cookies.set(SESSION_COOKIE, create_session_token(uid, sv, get_settings()))


def test_a_second_vote_on_the_same_answer_replaces_the_first_679(chat):
    c, S = chat
    _, body = _session(c)
    tid = _thread(c, _as(body["token"]))
    assert _rate(c, tid, 1, "down", "First thought.").status_code == 200
    r = _rate(c, tid, 1, "wrong", "The Nami is a 4 cost.")
    assert r.status_code == 200 and (r.json()["rating"], r.json()["note"]) == ("wrong", "The Nami is a 4 cost.")
    assert _rate(c, tid, 0, "down").status_code == 200
    with S() as db:
        rows = db.scalars(select(AnalystFeedback).order_by(AnalystFeedback.message_index)).all()
        assert [(f.message_index, f.rating, f.note) for f in rows] == [(0, "down", ""), (1, "wrong", "The Nami is a 4 cost.")]
    mine = {(v["message_index"], v["rating"]) for v in c.get("/analyst/feedback", params={"thread_id": tid}).json()["votes"]}
    assert mine == {(0, "down"), (1, "wrong")}


def test_feedback_keeps_the_answer_and_question_as_stored_679(chat):
    c, S = chat
    _, body = _session(c)
    tid = _thread(c, _as(body["token"]), answers=("A" * 5000, "Short."))
    assert _rate(c, tid, 0, "wrong").status_code == 200
    with S() as db:
        f = db.scalars(select(AnalystFeedback)).one()
        assert f.answer_excerpt == "A" * 4000 and f.question_excerpt == "Question 0?"
        assert (f.kind, f.target) == ("chat", f"chat:{tid}:0")
        assert f.model


def test_feedback_needs_a_signed_in_player_with_log_pose_679(chat):
    c, S = chat
    _, body = _session(c)
    tid = _thread(c, _as(body["token"]))
    c.cookies.clear()
    assert _rate(c, tid, 0).status_code == 401
    assert c.get("/analyst/feedback", params={"thread_id": tid}).status_code == 401
    # Signed in, but Log Pose is not on for them.
    _login(c, S, _mk_user(S, "nobody@x.test"))
    assert _rate(c, tid, 0).status_code == 403
    with S() as db:
        assert db.scalars(select(AnalystFeedback)).all() == []


def test_the_note_is_capped_at_1000_characters_679(chat):
    c, S = chat
    _, body = _session(c)
    tid = _thread(c, _as(body["token"]))
    assert _rate(c, tid, 0, "wrong", "x" * 1001).status_code == 422
    assert _rate(c, tid, 0, "wrong", "x" * 1000).status_code == 200
    with S() as db:
        assert len(db.scalars(select(AnalystFeedback)).one().note) == 1000


def test_you_can_only_rate_your_own_answers_that_exist_679(chat):
    c, S = chat
    _, body = _session(c)
    tid = _thread(c, _as(body["token"]))
    other = _users(c, "alice")[0]
    with S() as db:
        row = AnalystThread(user_id=other, title="Alice's")
        db.add(row)
        db.commit()
        db.add(AnalystMessage(thread_id=row.id, role="assistant", content='"hi"'))
        db.commit()
        theirs = row.id
    assert _rate(c, theirs, 0).status_code == 404
    assert _rate(c, tid, 2).status_code == 404  # only two answers
    assert _rate(c, 99999, 0).status_code == 404
    assert c.post("/analyst/feedback", json={"kind": "review", "match_id": "nope", "rating": "up"}).status_code == 404
    assert c.post("/analyst/feedback", json={"kind": "chat", "rating": "up"}).status_code == 422
    assert c.post("/analyst/feedback", json={"kind": "chat", "thread_id": tid, "message_index": 0, "rating": "meh"}).status_code == 422
    assert c.post("/analyst/feedback", json={"kind": "review", "thread_id": tid, "rating": "up"}).status_code == 422


def test_a_panel_that_drifted_from_the_thread_cannot_rate_another_answer_679(chat):
    c, S = chat
    _, body = _session(c)
    tid = _thread(c, _as(body["token"]))
    base = {"kind": "chat", "thread_id": tid, "message_index": 1, "rating": "down"}
    assert c.post("/analyst/feedback", json={**base, "starts_with": "Play  Zoro on"}).status_code == 409  # that is answer 0
    assert c.post("/analyst/feedback", json={**base, "starts_with": "Keep the\nNami."}).status_code == 200
    with S() as db:
        assert [(f.message_index, f.answer_excerpt) for f in db.scalars(select(AnalystFeedback)).all()] == [(1, "Keep the Nami.")]


def test_a_review_is_rated_by_the_player_it_was_written_for_679(chat):
    c, S = chat
    me, body = _session(c)
    a, _ = _users(c, "alice", "bob")
    _ingest(c, "mine", a, me["id"], 1)
    c.put("/analyst/reviews/mine", json={"text": "You lost on turn 6."}, headers=_as(body["token"]))
    r = c.post("/analyst/feedback", json={"kind": "review", "match_id": "mine", "rating": "wrong", "note": "Turn 5."})
    assert r.status_code == 200
    c.post("/analyst/feedback", json={"kind": "review", "match_id": "mine", "rating": "up"})
    with S() as db:
        f = db.scalars(select(AnalystFeedback)).one()
        assert (f.kind, f.match_id, f.rating, f.answer_excerpt, f.thread_id) == ("review", "mine", "up", "You lost on turn 6.", None)
    assert c.get("/analyst/feedback", params={"match_id": "mine"}).json()["votes"] == [
        {"kind": "review", "rating": "up", "note": "", "thread_id": None, "message_index": None, "match_id": "mine"}
    ]


def test_feedback_is_rate_limited_per_player_679(chat):
    c, _ = chat
    _, body = _session(c)
    tid = _thread(c, _as(body["token"]))
    codes = [_rate(c, tid, 0, "up" if i % 2 else "down").status_code for i in range(62)]
    assert codes[:60] == [200] * 60 and codes[60:] == [429, 429]


def test_the_admin_lists_feedback_newest_first_with_30_day_counts_679(chat):
    c, S = chat
    me, body = _session(c)
    tid = _thread(c, _as(body["token"]))
    _rate(c, tid, 0, "wrong", "Wrong cost.")
    _rate(c, tid, 1, "up")
    old = datetime.now(timezone.utc) - timedelta(days=45)
    with S() as db:
        db.add(AnalystFeedback(user_id=me["id"], kind="chat", target="chat:1:9", thread_id=1, message_index=9, rating="down", created_at=old, updated_at=old))
        db.commit()
    _login(c, S, _mk_user(S, ADMIN_EMAIL, "admin"))
    out = c.get("/admin/feedback").json()
    assert out["counts"] == {"up": 1, "down": 0, "wrong": 1}  # the 45-day-old down vote is not counted
    assert [(i["rating"], i["note"], i["answer_excerpt"]) for i in out["items"]][:2] == [
        ("up", "", "Keep the Nami."),
        ("wrong", "Wrong cost.", "Play Zoro on turn 2."),
    ]
    assert out["items"][0]["user_name"] and out["items"][0]["kind"] == "chat"
    assert [i["rating"] for i in c.get("/admin/feedback", params={"rating": "wrong"}).json()["items"]] == ["wrong"]


def test_other_players_and_moderators_cannot_read_feedback_679(chat):
    c, S = chat
    _, body = _session(c)
    tid = _thread(c, _as(body["token"]))
    _rate(c, tid, 0, "wrong", "secret note")
    assert c.get("/admin/feedback").status_code == 403  # the author is not staff
    assert c.get("/admin/feedback/export", params={"rating": "wrong"}).status_code == 403
    for email, role in (("p@x.test", "user"), ("mod@x.test", "moderator")):
        _login(c, S, _mk_user(S, email, role))
        assert c.get("/admin/feedback").status_code == 403, role
    c.cookies.clear()
    assert c.get("/admin/feedback").status_code == 401


def test_another_player_with_log_pose_sees_none_of_your_ratings_and_cannot_rate_your_answers_679(chat):
    c, S = chat
    _, body = _session(c)
    tid = _thread(c, _as(body["token"]))
    _rate(c, tid, 0, "wrong", "secret note")
    # Someone Else is on ANALYST_CHAT_EMAILS too, so Log Pose is on for them.
    _login(c, S, _mk_user(S, "someone@else.example"))
    assert c.get("/analyst/feedback", params={"thread_id": tid}).json() == {"votes": []}
    assert _rate(c, tid, 0, "down").status_code == 404
    with S() as db:
        assert [(f.rating, f.note) for f in db.scalars(select(AnalystFeedback)).all()] == [("wrong", "secret note")]


def test_the_service_exports_wrong_answers_without_player_names_679(chat):
    c, _ = chat
    _, body = _session(c)
    tid = _thread(c, _as(body["token"]))
    _rate(c, tid, 0, "wrong", "Wrong cost.")
    _rate(c, tid, 1, "up")
    assert c.get("/admin/feedback/export").status_code == 403
    assert c.get("/admin/feedback/export", headers={"X-Analyst-Service": "nope"}).status_code == 403
    items = c.get("/admin/feedback/export", headers=SERVICE).json()["items"]
    assert [(i["rating"], i["note"], i["question"], i["answer_excerpt"]) for i in items] == [("wrong", "Wrong cost.", "Question 0?", "Play Zoro on turn 2.")]
    assert "user_name" not in items[0] and "user_id" not in items[0]
