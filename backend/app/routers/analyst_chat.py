"""Log Pose in the app: chat sessions, threads, spend caps, post-game reviews and the game corpus.

The browser gets a short-lived chat token from /analyst/chat/session and talks to the analyst
service, which reads and writes everything here with that token plus the service secret.
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import case, delete, func, or_, select, update
from sqlalchemy.orm import Session

from app.analyst_corpus import MAX_GAMES, game_replay, search_games
from app.analyst_credit import credit_for, day_start, month_start, next_month_start, refusal_for, spent_since
from app.auth import get_current_user
from app.config import Settings, get_settings
from app.db import get_db
from app.brief_tickets import BriefClaims, brief_key, deck_counts, verify_brief_ticket
from app.models import (
    AnalystAccess,
    AnalystSetting,
    AnalystMatchBrief,
    AnalystMatchReview,
    AnalystMessage,
    AnalystProposal,
    AnalystThread,
    AnalystUsage,
    DuelMatch,
    User,
)
from app.routers.analyst_access import free_spots, spots_used
from app.routers.analyst import CHAT_MODELS, access_status, analyst_user, chat_enabled_for, chat_model, is_chat_owner, is_model_admin, mint_chat_token, require_service, requests_open
from app.usernames import duel_display_name
from app.schemas import (
    CARD_ID_PATTERN,
    AnalystAppendIn,
    AnalystModelIn,
    AnalystModelSetting,
    AnalystBriefIn,
    AnalystBriefLookupIn,
    AnalystBriefLookupOut,
    AnalystBriefOut,
    AnalystChatBudget,
    AnalystCitation,
    AnalystChatSession,
    AnalystDeckEdit,
    AnalystDisplayMessage,
    AnalystProposalsIn,
    AnalystReviewIn,
    AnalystReviewOut,
    AnalystStoredMessage,
    AnalystThreadContent,
    AnalystThreadIn,
    AnalystThreadsOut,
    AnalystThreadSummary,
    AnalystThreadView,
    AnalystUsageGroup,
    AnalystUsageIn,
    AnalystUsagePlayer,
    AnalystUsageSummary,
)

router = APIRouter(prefix="/analyst", tags=["analyst"])

# The analyst puts page/deck context in a user text block starting with this; the panel hides it.
CONTEXT_PREFIX = "<context>"
MAX_MESSAGE_BYTES = 400_000
MAX_THREAD_MESSAGES = 400


def _service(settings: Annotated[Settings, Depends(get_settings)], x_analyst_service: Annotated[str | None, Header()] = None) -> None:
    require_service(settings, x_analyst_service)


Service = Annotated[None, Depends(_service)]


@router.post("/chat/session", response_model=AnalystChatSession)
def chat_session(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AnalystChatSession:
    """Whether the Log Pose panel is on for this player, and a fresh token for it when it is.

    When it is off but players can ask for it, `access` says where their request stands."""
    if not chat_enabled_for(settings, user, db):
        if not requests_open(settings):
            return AnalystChatSession(enabled=False)
        free = free_spots(db, settings)
        return AnalystChatSession(
            enabled=False,
            access=access_status(db, user) or "none",
            free_spots=free,
            spots_left=max(0, free - spots_used(db)),
            free_credit_usd=settings.analyst_user_credit_usd,
        )
    token, exp = mint_chat_token(settings, user, int(datetime.now(timezone.utc).timestamp()))
    expires_at = datetime.fromtimestamp(exp, timezone.utc).isoformat()
    owner = is_chat_owner(settings, user)
    # Waiting requests: players on the waitlist and players who asked for more credit.
    pending = (
        db.scalar(
            select(func.count())
            .select_from(AnalystAccess)
            .where(or_(AnalystAccess.status == "pending", AnalystAccess.topup_requested_at.is_not(None)))
        )
        or 0
        if owner
        else 0
    )
    return AnalystChatSession(
        enabled=True,
        token=token,
        expires_at=expires_at,
        chat_url=settings.analyst_public_url.rstrip("/"),
        owner=owner,
        pending_requests=pending,
    )


def budget_for(db: Session, settings: Settings, user: User, extra: float = 0.0) -> AnalystChatBudget:
    """This player's spend today, their credit this month and everyone's spend this month, against the limits.

    `extra` is what a running answer has cost so far (not saved yet); it counts toward every limit."""
    now = datetime.now(timezone.utc)
    today = spent_since(db, day_start(now), user.id) + extra
    month = spent_since(db, month_start(now)) + extra
    credit_spent = spent_since(db, month_start(now), user.id) + extra
    row = db.scalar(select(AnalystAccess).where(AnalystAccess.user_id == user.id))
    credit = credit_for(settings, user, row, now)
    refusal = refusal_for(settings, spent_today=today, spent_month=month, credit=credit, credit_spent=credit_spent)
    recent = db.scalars(
        select(AnalystUsage.cost_usd)
        .where(AnalystUsage.user_id == user.id, AnalystUsage.kind == "chat", AnalystUsage.cost_usd > 0)
        .order_by(AnalystUsage.id.desc())
        .limit(30)
    ).all()
    return AnalystChatBudget(
        spent_today_usd=round(today, 4),
        daily_cap_usd=settings.analyst_chat_daily_usd,
        spent_month_usd=round(month, 4),
        monthly_cap_usd=settings.analyst_chat_monthly_usd,
        allowed=refusal is None,
        model=chat_model(db),
        credit_usd=None if credit is None else round(credit, 4),
        credit_spent_usd=round(credit_spent, 4),
        credit_resets_at=next_month_start(now).isoformat(),
        refusal=refusal,  # type: ignore[arg-type]
        avg_chat_cost_usd=round(sum(recent) / len(recent), 4) if recent else None,
        topup_requested=row is not None and row.topup_requested_at is not None,
    )


@router.get("/chat/budget", response_model=AnalystChatBudget)
def chat_budget(
    _: Service,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(analyst_user)],
    settings: Annotated[Settings, Depends(get_settings)],
    extra: Annotated[float, Query(ge=0, le=1000)] = 0.0,
) -> AnalystChatBudget:
    """The analyst's check before (and, with `extra`, during) an answer: may this player ask, and which limit stops them."""
    return budget_for(db, settings, user, extra)


@router.get("/chat/credit", response_model=AnalystChatBudget)
def chat_credit(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AnalystChatBudget:
    """The signed-in player's own credit and limits, for the panel's meter."""
    if not chat_enabled_for(settings, user, db):
        raise HTTPException(status_code=403, detail="Log Pose isn't on for you")
    return budget_for(db, settings, user)


@router.get("/usage/summary", response_model=AnalystUsageSummary)
def usage_summary(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AnalystUsageSummary:
    """What Log Pose has cost, for owners: today, this month and all time, per player, and per kind and model."""
    if not is_chat_owner(settings, user):
        raise HTTPException(status_code=403, detail="Only Log Pose owners can see usage")
    now = datetime.now(timezone.utc)
    this_month = month_start(now)
    U = AnalystUsage
    asked = (U.outcome != "refused") & (U.kind == "chat")
    rows = db.execute(
        select(
            U.user_id,
            func.coalesce(func.sum(U.cost_usd), 0.0),
            func.coalesce(func.sum(case((U.created_at >= this_month, U.cost_usd), else_=0.0)), 0.0),
            func.coalesce(func.sum(case((asked, 1), else_=0)), 0),
            func.coalesce(func.sum(case((U.outcome == "refused", 1), else_=0)), 0),
            func.max(U.created_at),
        )
        .group_by(U.user_id)
        .order_by(func.sum(U.cost_usd).desc())
        .limit(100)
    ).all()
    access = {a.user_id: a for a in db.scalars(select(AnalystAccess)).all()}
    threads = dict(db.execute(select(AnalystThread.user_id, func.count()).group_by(AnalystThread.user_id)).all())
    players = []
    for uid, total, month, questions, refused, last in rows:
        u = db.get(User, uid)
        if u is None:
            continue
        players.append(
            AnalystUsagePlayer(
                user_id=uid,
                name=duel_display_name(u),
                spent_usd=round(float(total), 4),
                credit_usd=credit_for(settings, u, access.get(uid), now),
                credit_spent_usd=round(float(month), 4),
                threads=int(threads.get(uid, 0)),
                questions=int(questions),
                refused=int(refused),
                last_used=last.isoformat() if last else None,
            )
        )
    groups = db.execute(
        select(U.kind, U.model, func.coalesce(func.sum(case((U.outcome != "refused", 1), else_=0)), 0), func.coalesce(func.sum(U.cost_usd), 0.0))
        .group_by(U.kind, U.model)
        .order_by(func.sum(U.cost_usd).desc())
    ).all()
    return AnalystUsageSummary(
        today_usd=round(spent_since(db, day_start(now)), 4),
        month_usd=round(spent_since(db, this_month), 4),
        total_usd=round(spent_since(db, datetime(2000, 1, 1, tzinfo=timezone.utc)), 4),
        players=players,
        groups=[AnalystUsageGroup(kind=k, model=m or "unknown", requests=int(n), cost_usd=round(float(c), 4)) for k, m, n, c in groups if n or c],
    )


def _model_setting(db: Session, settings: Settings, user: User) -> AnalystModelSetting:
    return AnalystModelSetting(model=chat_model(db), options=list(CHAT_MODELS), can_edit=is_model_admin(settings, user))


@router.get("/settings/model", response_model=AnalystModelSetting)
def get_model_setting(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AnalystModelSetting:
    """The model Log Pose runs on for everyone, and whether this player may change it."""
    if not (is_model_admin(settings, user) or chat_enabled_for(settings, user, db)):
        raise HTTPException(status_code=403, detail="Log Pose isn't on for you")
    return _model_setting(db, settings, user)


@router.put("/settings/model", response_model=AnalystModelSetting)
def put_model_setting(
    body: AnalystModelIn,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AnalystModelSetting:
    if not is_model_admin(settings, user):
        raise HTTPException(status_code=403, detail="Only the Log Pose model admin can change the model")
    if body.model not in CHAT_MODELS:
        raise HTTPException(status_code=422, detail="Unknown model")
    row = db.get(AnalystSetting, "chat_model")
    if row is None:
        db.add(AnalystSetting(key="chat_model", value=body.model))
    else:
        row.value = body.model
    db.commit()
    return _model_setting(db, settings, user)


@router.post("/chat/usage", status_code=204)
def record_usage(
    body: AnalystUsageIn,
    _: Service,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(analyst_user)],
) -> None:
    fields = body.model_dump()
    # A thread id only sticks to the player's own thread.
    if body.thread_id is not None:
        own = db.get(AnalystThread, body.thread_id)
        if own is None or own.user_id != user.id:
            fields["thread_id"] = None
    db.add(AnalystUsage(user_id=user.id, **fields))
    db.commit()


def _own_thread(db: Session, user: User, thread_id: int) -> AnalystThread:
    row = db.get(AnalystThread, thread_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Thread not found")
    return row


@router.post("/chat/threads", response_model=AnalystThreadSummary, status_code=201)
def create_thread(
    body: AnalystThreadIn,
    _: Service,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(analyst_user)],
) -> AnalystThreadSummary:
    row = AnalystThread(user_id=user.id, title=body.title.strip())
    db.add(row)
    db.commit()
    db.refresh(row)
    return AnalystThreadSummary(id=row.id, title=row.title, updated_at=row.updated_at.isoformat() if row.updated_at else None)


@router.delete("/chat/threads/{thread_id}", status_code=204)
def delete_thread(
    thread_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> None:
    """A player deletes one of their threads: its messages and deck-edit cards go; its usage rows stay so cost totals don't change."""
    row = _own_thread(db, user, thread_id)
    db.execute(update(AnalystUsage).where(AnalystUsage.thread_id == row.id).values(thread_id=None))
    db.execute(delete(AnalystProposal).where(AnalystProposal.thread_id == row.id))
    db.execute(delete(AnalystMessage).where(AnalystMessage.thread_id == row.id))
    db.delete(row)
    db.commit()


def _messages(db: Session, thread_id: int) -> list[AnalystMessage]:
    return list(db.scalars(select(AnalystMessage).where(AnalystMessage.thread_id == thread_id).order_by(AnalystMessage.id)).all())


@router.get("/chat/threads/{thread_id}/content", response_model=AnalystThreadContent)
def thread_content(
    thread_id: int,
    _: Service,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(analyst_user)],
) -> AnalystThreadContent:
    """The thread exactly as stored, for the analyst to resend to the model."""
    row = _own_thread(db, user, thread_id)
    return AnalystThreadContent(
        id=row.id,
        title=row.title,
        messages=[AnalystStoredMessage(role=m.role, content=json.loads(m.content)) for m in _messages(db, row.id)],
    )


@router.post("/chat/threads/{thread_id}/messages", status_code=204)
def append_messages(
    thread_id: int,
    body: AnalystAppendIn,
    _: Service,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(analyst_user)],
) -> None:
    """Add messages to the end of a thread. Stored messages are never changed."""
    row = _own_thread(db, user, thread_id)
    have = db.scalar(select(func.count()).select_from(AnalystMessage).where(AnalystMessage.thread_id == row.id)) or 0
    if have + len(body.messages) > MAX_THREAD_MESSAGES:
        raise HTTPException(status_code=409, detail="This thread is full; start a new one")
    for m in body.messages:
        content = json.dumps(m.content)
        if len(content) > MAX_MESSAGE_BYTES:
            raise HTTPException(status_code=413, detail="Message too large")
        db.add(AnalystMessage(thread_id=row.id, role=m.role, content=content))
    row.updated_at = datetime.now(timezone.utc)
    db.commit()


PROPOSE_TOOL = "propose_deck_edit"


def _proposal_ids(content: str | list[dict]) -> list[str]:
    """The ids of the propose_deck_edit calls in one stored message."""
    if not isinstance(content, list):
        return []
    return [
        b["id"]
        for b in content
        if isinstance(b, dict) and b.get("type") == "tool_use" and b.get("name") == PROPOSE_TOOL and isinstance(b.get("id"), str)
    ]


@router.post("/chat/threads/{thread_id}/proposals", status_code=204)
def save_proposals(
    thread_id: int,
    body: AnalystProposalsIn,
    _: Service,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(analyst_user)],
) -> None:
    """The analyst keeps the deck edits it suggested in a turn next to the thread, so their cards come back on reload (#400).

    Each must come from a propose_deck_edit call stored in this thread; repeats are ignored.
    """
    row = _own_thread(db, user, thread_id)
    made = {i for m in _messages(db, row.id) if m.role == "assistant" for i in _proposal_ids(json.loads(m.content))}
    if any(p.id not in made for p in body.proposals):
        raise HTTPException(status_code=400, detail="A proposal must come from a propose_deck_edit call in this thread")
    have = set(db.scalars(select(AnalystProposal.id).where(AnalystProposal.thread_id == row.id)).all())
    for p in body.proposals:
        if p.id not in have:
            have.add(p.id)
            db.add(AnalystProposal(thread_id=row.id, id=p.id, payload=p.model_dump_json()))
    db.commit()


def _stored_proposals(db: Session, thread_id: int) -> dict[str, AnalystDeckEdit]:
    out: dict[str, AnalystDeckEdit] = {}
    for r in db.scalars(select(AnalystProposal).where(AnalystProposal.thread_id == thread_id).order_by(AnalystProposal.created_at)).all():
        try:
            out[r.id] = AnalystDeckEdit.model_validate_json(r.payload)
        except ValueError:
            continue
    return out


MAX_CITED_TEXT = 800


def _utf16_len(text: str) -> int:
    """Length in UTF-16 code units, the offsets the browser counts text in."""
    return len(text.encode("utf-16-le")) // 2


def _block_citations(block: dict) -> list[dict]:
    """The search-result citations on one text block (other kinds aren't ours), without repeats."""
    seen: set[tuple[str, str]] = set()
    out: list[dict] = []
    for raw in block.get("citations") or []:
        if not isinstance(raw, dict) or raw.get("type") != "search_result_location":
            continue
        source, quote = raw.get("source"), raw.get("cited_text") or ""
        if not isinstance(source, str) or not source or not isinstance(quote, str) or (source, quote) in seen:
            continue
        seen.add((source, quote))
        title = raw.get("title")
        out.append(
            {
                "source": source[:200],
                "title": title[:200] if isinstance(title, str) else "",
                "cited_text": quote if len(quote) <= MAX_CITED_TEXT else quote[: MAX_CITED_TEXT - 1] + "\u2026",
            }
        )
    return out


def _display_text(role: str, content: str | list[dict]) -> tuple[str, list[AnalystCitation]]:
    """What the panel shows for a stored message: its text blocks run together (as they stream), without tool calls,
    tool results or page context, and the citations at the end of the blocks they belong to."""
    if isinstance(content, str):
        return ("" if content.startswith(CONTEXT_PREFIX) else content), []
    text = ""
    cites: list[AnalystCitation] = []
    for b in content:
        if b.get("type") != "text":
            continue
        piece = b.get("text", "")
        if role == "user" and piece.startswith(CONTEXT_PREFIX):
            continue
        text += piece
        if role == "assistant":
            at = _utf16_len(text)
            cites += [AnalystCitation(at=at, **c) for c in _block_citations(b)]
    return text, cites


def _attach(out: list[AnalystDisplayMessage], pending: list[AnalystDeckEdit]) -> None:
    """Put the deck edits of a finished turn under the answer that ended it (an answer of its own when there is none)."""
    if not pending:
        return
    if out and out[-1].role == "assistant":
        out[-1].proposals += pending
    else:
        out.append(AnalystDisplayMessage(role="assistant", text="", proposals=list(pending)))
    pending.clear()


def thread_view(
    messages: list[tuple[str, str | list[dict]]], proposals: dict[str, AnalystDeckEdit] | None = None
) -> list[AnalystDisplayMessage]:
    """Stored messages as chat bubbles: tool-result-only turns drop out and one answer's pieces join up.

    A deck edit goes under the bubble that ends the turn it was suggested in (#400)."""
    out: list[AnalystDisplayMessage] = []
    pending: list[AnalystDeckEdit] = []
    for role, content in messages:
        if role == "assistant":
            pending += [proposals[i] for i in _proposal_ids(content) if proposals and i in proposals]
        text, cites = _display_text(role, content)
        if not text.strip():
            continue
        if role == "user":
            _attach(out, pending)
        if out and out[-1].role == role == "assistant":
            base = _utf16_len(out[-1].text) + 2
            out[-1].text += "\n\n" + text
            out[-1].citations += [c.model_copy(update={"at": c.at + base}) for c in cites]
        else:
            out.append(AnalystDisplayMessage(role=role, text=text, citations=cites))
    _attach(out, pending)
    return out


@router.get("/chat/threads", response_model=AnalystThreadsOut)
def list_threads(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> AnalystThreadsOut:
    """The signed-in player's threads, newest first. A thread whose first answer never finished isn't listed."""
    answered = select(AnalystMessage.id).where(AnalystMessage.thread_id == AnalystThread.id).exists()
    rows = db.scalars(
        select(AnalystThread).where(AnalystThread.user_id == user.id, answered).order_by(AnalystThread.updated_at.desc(), AnalystThread.id.desc()).limit(50)
    ).all()
    return AnalystThreadsOut(
        threads=[AnalystThreadSummary(id=r.id, title=r.title, updated_at=r.updated_at.isoformat() if r.updated_at else None) for r in rows]
    )


@router.get("/chat/threads/{thread_id}", response_model=AnalystThreadView)
def view_thread(
    thread_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> AnalystThreadView:
    """One of the signed-in player's threads as the panel shows it."""
    row = _own_thread(db, user, thread_id)
    return AnalystThreadView(
        id=row.id,
        title=row.title,
        messages=thread_view([(m.role, json.loads(m.content)) for m in _messages(db, row.id)], _stored_proposals(db, row.id)),
    )


def _review_out(row: AnalystMatchReview) -> AnalystReviewOut:
    try:
        citations = [AnalystCitation(**c) for c in json.loads(row.citations or "[]")]
    except (ValueError, TypeError):
        citations = []
    return AnalystReviewOut(
        match_id=row.match_id,
        text=row.text,
        citations=citations,
        created_at=row.created_at.isoformat() if row.created_at else None,
    )


@router.get("/reviews/{match_id}", response_model=AnalystReviewOut)
def get_review(
    match_id: str,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> AnalystReviewOut:
    """The saved post-game analysis of one of the signed-in player's games."""
    row = db.get(AnalystMatchReview, (user.id, match_id))
    if row is None:
        raise HTTPException(status_code=404, detail="No analysis yet")
    return _review_out(row)


@router.put("/reviews/{match_id}", response_model=AnalystReviewOut)
def put_review(
    match_id: str,
    body: AnalystReviewIn,
    _: Service,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(analyst_user)],
) -> AnalystReviewOut:
    """The analyst saves a post-game analysis for a finished game the player was in."""
    played = db.scalar(
        select(DuelMatch.id).where(
            DuelMatch.match_id == match_id, or_(DuelMatch.seat0_user_id == user.id, DuelMatch.seat1_user_id == user.id)
        )
    )
    if played is None:
        raise HTTPException(status_code=404, detail="Match not found")
    # A citation can only follow text that is there.
    limit = _utf16_len(body.text)
    citations = json.dumps([c.model_dump() for c in body.citations if c.at <= limit])
    row = db.get(AnalystMatchReview, (user.id, match_id))
    if row is None:
        row = AnalystMatchReview(user_id=user.id, match_id=match_id, text=body.text, citations=citations)
        db.add(row)
    else:
        row.text = body.text
        row.citations = citations
        row.created_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return _review_out(row)


BRIEF_TTL = timedelta(days=7)


def _brief_claims(body: AnalystBriefLookupIn, settings: Settings) -> BriefClaims:
    """The ticket's claims; a forged, expired, ranked or non-ticket string is a 403."""
    claims = verify_brief_ticket(body.ticket, settings, int(time.time()))
    if claims is None:
        raise HTTPException(status_code=403, detail="Not a valid brief ticket")
    return claims


def _brief_out(row: AnalystMatchBrief) -> AnalystBriefOut:
    try:
        citations = [AnalystCitation(**c) for c in json.loads(row.citations or "[]")]
    except (ValueError, TypeError):
        citations = []
    return AnalystBriefOut(
        text=row.text, citations=citations, created_at=row.created_at.isoformat() if row.created_at else None
    )


@router.post("/briefs/lookup", response_model=AnalystBriefLookupOut)
def lookup_brief(
    body: AnalystBriefLookupIn,
    _: Service,
    db: Annotated[Session, Depends(get_db)],
    __: Annotated[User, Depends(analyst_user)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AnalystBriefLookupOut:
    """What a matchup brief is about (from a game-server ticket) and the saved brief for it, if it is fresh."""
    claims = _brief_claims(body, settings)
    key = brief_key(claims, body.variant)
    row = db.get(AnalystMatchBrief, key)
    brief = None
    if row is not None:
        made = row.created_at
        if made is not None and made.tzinfo is None:
            made = made.replace(tzinfo=timezone.utc)
        if made is None or made >= datetime.now(timezone.utc) - BRIEF_TTL:
            brief = _brief_out(row)
    return AnalystBriefLookupOut(
        leader_id=claims.leader, opponent_id=claims.opponent, deck=deck_counts(claims), key=key, brief=brief
    )


@router.put("/briefs", status_code=204)
def put_brief(
    body: AnalystBriefIn,
    _: Service,
    db: Annotated[Session, Depends(get_db)],
    __: Annotated[User, Depends(analyst_user)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> None:
    """The analyst saves a matchup brief for the ticket's leaders and deck (the ticket is checked again)."""
    claims = _brief_claims(body, settings)
    key = brief_key(claims, body.variant)
    # A citation can only follow text that is there.
    limit = _utf16_len(body.text)
    citations = json.dumps([c.model_dump() for c in body.citations if c.at <= limit])
    row = db.get(AnalystMatchBrief, key)
    if row is None:
        row = AnalystMatchBrief(
            key=key,
            variant=body.variant,
            leader_id=claims.leader,
            opponent_id=claims.opponent,
            text=body.text,
            citations=citations,
        )
        db.add(row)
    else:
        row.text = body.text
        row.citations = citations
        row.created_at = datetime.now(timezone.utc)
    db.commit()


@router.get("/corpus/games")
def corpus_games(
    _: Service,
    db: Annotated[Session, Depends(get_db)],
    leader: Annotated[str | None, Query(pattern=CARD_ID_PATTERN)] = None,
    opponent: Annotated[str | None, Query(pattern=CARD_ID_PATTERN)] = None,
    card: Annotated[str | None, Query(pattern=CARD_ID_PATTERN)] = None,
    result: Literal["won", "lost"] | None = None,
    went_first: bool | None = None,
    ranked_only: bool = False,
    days: Annotated[int, Query(ge=1, le=365)] = 90,
    min_turns: Annotated[int | None, Query(ge=0, le=100)] = None,
    max_turns: Annotated[int | None, Query(ge=0, le=100)] = None,
    limit: Annotated[int, Query(ge=1, le=MAX_GAMES)] = 20,
    offset: Annotated[int, Query(ge=0, le=10_000)] = 0,
) -> dict:
    """Search every shared game (anonymized) for the analyst service."""
    if result is not None and not (leader or opponent):
        raise HTTPException(status_code=400, detail="Give a leader or opponent with the result")
    return search_games(
        db, leader=leader, opponent=opponent, card=card, result=result, went_first=went_first,
        ranked_only=ranked_only, days=days, min_turns=min_turns, max_turns=max_turns, limit=limit, offset=offset,
    )


@router.get("/corpus/games/{game_id}/replay")
def corpus_replay(game_id: str, _: Service, db: Annotated[Session, Depends(get_db)]) -> dict:
    out = game_replay(db, game_id)
    if out is None:
        raise HTTPException(status_code=404, detail="Game not found")
    return out
