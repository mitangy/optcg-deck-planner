"""Admin page API (#667): player and bot analytics, evals, hosting status, and account moderation.

Auth: staff (admin or moderator) for /admin/me and the user list, ban and unban; admin only for
analytics, roles, deletes and hosting; the analyst service secret for POST /admin/evals.
"""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import case, func, or_, select, update
from sqlalchemy.orm import Session

from app import admin_hosting
from app.analyst_credit import month_start, spent_since
from app.auth import get_current_user
from app.config import Settings, get_settings
from app.db import get_db
from app.models import (
    AnalystAccess,
    AnalystEvalRun,
    AnalystFeedback,
    AnalystUsage,
    Base,
    BotMatch,
    Deck,
    DuelMatch,
    DuelMatchSeat,
    User,
)
from app.usernames import duel_display_name
from app.roles import ASSIGNABLE_ROLES, can_ban, can_delete, can_set_role, is_admin, is_staff
from app.routers.analyst import require_service

router = APIRouter(prefix="/admin", tags=["admin"])

DB = Annotated[Session, Depends(get_db)]
GUEST_SUFFIX = "@localhost"


def require_staff(user: Annotated[User, Depends(get_current_user)]) -> User:
    if not is_staff(user):
        raise HTTPException(status_code=403, detail="Staff only")
    return user


def require_admin(user: Annotated[User, Depends(get_current_user)]) -> User:
    if not is_admin(user):
        raise HTTPException(status_code=403, detail="Admin only")
    return user


Staff = Annotated[User, Depends(require_staff)]
Admin = Annotated[User, Depends(require_admin)]


def _utc(dt: datetime | None) -> datetime | None:
    """SQLite hands back naive datetimes; they are UTC."""
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _iso(dt: datetime | None) -> str | None:
    dt = _utc(dt)
    return dt.isoformat() if dt else None


def _days(now: datetime, n: int) -> list[date]:
    """The last n UTC days, oldest first, ending today."""
    today = now.date()
    return [today - timedelta(days=i) for i in range(n - 1, -1, -1)]


def _bucket(stamps: list[datetime | None], days: list[date]) -> dict[date, int]:
    """Count timestamps per UTC day in Python, so it behaves the same on SQLite and Postgres."""
    counts = {d: 0 for d in days}
    for t in stamps:
        t = _utc(t)
        if t is not None and t.date() in counts:
            counts[t.date()] += 1
    return counts


def _is_guest():
    return User.email.like(f"%{GUEST_SUFFIX}")


# ---------------------------------------------------------------- who am I

@router.get("/me")
def admin_me(user: Staff) -> dict:
    admin = is_admin(user)
    return {"role": user.role, "can": {"analytics": admin, "set_roles": admin, "ban": True, "delete": admin}}


# ---------------------------------------------------------------- players

@router.get("/overview")
def overview(_: Admin, db: DB) -> dict:
    now = datetime.now(timezone.utc)
    d1, d7, d30 = now - timedelta(days=1), now - timedelta(days=7), now - timedelta(days=30)
    guest = _is_guest()

    def users(*where) -> int:
        return int(db.scalar(select(func.count()).select_from(User).where(*where)) or 0)

    total = users()
    guests = users(guest)
    accounts = {
        "total": total,
        "real": total - guests,
        "guests": guests,
        "staff": users(User.role.in_(("admin", "moderator"))),
        "banned": users(User.banned_at.is_not(None)),
        "new_7d": users(User.created_at >= d7),
        "new_30d": users(User.created_at >= d30),
    }

    days30 = _days(now, 30)
    window_start = datetime.combine(days30[0], datetime.min.time(), tzinfo=timezone.utc)
    signups = db.execute(select(User.created_at, guest).where(User.created_at >= window_start)).all()
    real_by_day = _bucket([c for c, g in signups if not g], days30)
    guest_by_day = _bucket([c for c, g in signups if g], days30)

    def active(since: datetime, real_only: bool = False) -> int:
        ids: set[int] = set()
        seats = select(DuelMatchSeat.user_id).where(DuelMatchSeat.created_at >= since).distinct()
        ids.update(db.scalars(seats))
        for col in (DuelMatch.seat0_user_id, DuelMatch.seat1_user_id):
            ids.update(db.scalars(select(col).where(DuelMatch.created_at >= since).distinct()))
        if real_only and ids:
            ids = set(db.scalars(select(User.id).where(User.id.in_(ids), ~guest)))
        return len(ids)

    active_out = {
        "d1": active(d1),
        "d7": active(d7),
        "d30": active(d30),
        "real_d7": active(d7, True),
        "real_d30": active(d30, True),
    }

    matches30 = db.execute(select(DuelMatch.created_at, DuelMatch.ranked).where(DuelMatch.created_at >= window_start)).all()
    ranked_by_day = _bucket([t for t, r in matches30 if r], days30)
    casual_by_day = _bucket([t for t, r in matches30 if not r], days30)
    avg_turns = db.scalar(select(func.avg(DuelMatch.turns)).where(DuelMatch.created_at >= d30, DuelMatch.turns.is_not(None)))
    matches = {
        "total": int(db.scalar(select(func.count()).select_from(DuelMatch)) or 0),
        "last_7d": int(db.scalar(select(func.count()).select_from(DuelMatch).where(DuelMatch.created_at >= d7)) or 0),
        "ranked_7d": int(
            db.scalar(select(func.count()).select_from(DuelMatch).where(DuelMatch.created_at >= d7, DuelMatch.ranked.is_(True))) or 0
        ),
        "avg_turns_30d": round(float(avg_turns), 1) if avg_turns is not None else None,
    }

    games = func.count()
    wins = func.sum(case((DuelMatchSeat.won.is_(True), 1), else_=0))
    leaders = db.execute(
        select(DuelMatchSeat.leader_id, games, wins)
        .where(DuelMatchSeat.created_at >= d30)
        .group_by(DuelMatchSeat.leader_id)
        .order_by(games.desc(), DuelMatchSeat.leader_id)
        .limit(10)
    ).all()

    month = month_start(now)
    return {
        "generated_at": now.isoformat(),
        "accounts": accounts,
        "signups_by_day": [{"day": d.isoformat(), "real": real_by_day[d], "guests": guest_by_day[d]} for d in days30],
        "active": active_out,
        "matches_by_day": [{"day": d.isoformat(), "ranked": ranked_by_day[d], "casual": casual_by_day[d]} for d in days30],
        "matches": matches,
        "top_leaders_30d": [{"leader_id": lid, "games": int(g), "wins": int(w or 0)} for lid, g, w in leaders],
        "planner": {
            "decks": int(db.scalar(select(func.count()).select_from(Deck)) or 0),
            "users_with_decks": int(db.scalar(select(func.count(func.distinct(Deck.user_id)))) or 0),
        },
        "log_pose": {
            "questions_month": int(
                db.scalar(select(func.count()).select_from(AnalystUsage).where(AnalystUsage.kind == "chat", AnalystUsage.created_at >= month)) or 0
            ),
            "spend_month_usd": round(spent_since(db, month), 4),
            "users_with_access": int(
                db.scalar(select(func.count()).select_from(AnalystAccess).where(AnalystAccess.status == "approved")) or 0
            ),
        },
    }


# ---------------------------------------------------------------- bots and evals

def _eval_out(run: AnalystEvalRun) -> dict:
    try:
        groups = json.loads(run.groups or "{}")
    except ValueError:
        groups = {}
    scored = bool(run.total)
    return {
        "suite": run.suite or "main",
        "run_at": _iso(run.run_at),
        "label": run.label,
        "model": run.model,
        # A run that only has a headline metric has no score.
        "correct": run.correct if scored else None,
        "total": run.total if scored else None,
        "metric_name": run.metric_name,
        "metric_value": run.metric_value,
        "lower_is_better": bool(run.lower_is_better),
        "groups": groups,
        "spend_usd": run.spend_usd,
        "notes": run.notes,
    }


@router.get("/bots")
def bots(_: Admin, db: DB) -> dict:
    now = datetime.now(timezone.utc)
    rows = db.execute(
        select(BotMatch.created_at, BotMatch.batch_id, BotMatch.leader_a, BotMatch.leader_b, BotMatch.winner, BotMatch.turns, BotMatch.first_seat)
        .order_by(BotMatch.created_at, BotMatch.id)
    ).all()
    finished = [r for r in rows if r.winner is not None]
    turns = [r.turns for r in finished if r.turns is not None]
    seated = [r for r in finished if r.first_seat is not None]
    days14 = _days(now, 14)
    games_by_day = _bucket([r.created_at for r in rows], days14)
    finished_by_day = _bucket([r.created_at for r in finished], days14)
    evals = db.scalars(select(AnalystEvalRun).order_by(AnalystEvalRun.run_at, AnalystEvalRun.id)).all()
    return {
        "bot_games": {
            "total": len(rows),
            "finished": len(finished),
            "unfinished": len(rows) - len(finished),
            "first_game_at": _iso(rows[0].created_at) if rows else None,
            "last_game_at": _iso(rows[-1].created_at) if rows else None,
            "leaders": len({x for r in rows for x in (r.leader_a, r.leader_b)}),
            "matchups": len({tuple(sorted((r.leader_a, r.leader_b))) for r in rows}),
            "avg_turns": round(sum(turns) / len(turns), 1) if turns else None,
            "first_seat_win_rate": round(sum(1 for r in seated if r.winner == r.first_seat) / len(seated), 4) if seated else None,
            "last_batch_id": rows[-1].batch_id if rows else None,
            "by_day": [{"day": d.isoformat(), "games": games_by_day[d], "finished": finished_by_day[d]} for d in days14],
        },
        "evals": [_eval_out(e) for e in evals],
    }


class EvalGroupIn(BaseModel):
    correct: float = Field(ge=0, le=10_000)
    total: int = Field(ge=0, le=10_000)


# The evals that post here (analyst/evals/post.ts); each gets its own trend on the admin page (#679).
EvalSuite = Literal["main", "review_facts", "puzzles", "deck_advice"]


class EvalRunIn(BaseModel):
    run_at: datetime | None = None
    suite: EvalSuite = "main"
    label: str = Field(default="", max_length=120)
    model: str = Field(default="", max_length=64)
    # A score in cases out of total, for suites that have one. Leave both out for a run that only has a metric.
    correct: float | None = Field(default=None, ge=0, le=10_000)
    total: int | None = Field(default=None, ge=1, le=10_000)
    # The headline when the suite is not a score, e.g. "Wrong claims per review" 0.8 with lower_is_better.
    metric_name: str | None = Field(default=None, min_length=1, max_length=60)
    metric_value: float | None = Field(default=None, allow_inf_nan=False, ge=-1e9, le=1e9)
    lower_is_better: bool = False
    groups: dict[str, EvalGroupIn] = Field(default_factory=dict, max_length=12)
    spend_usd: float | None = Field(default=None, ge=0, le=100_000)
    notes: str = Field(default="", max_length=2000)

    @model_validator(mode="after")
    def _headline(self) -> "EvalRunIn":
        if (self.correct is None) != (self.total is None):
            raise ValueError("correct and total go together")
        if (self.metric_name is None) != (self.metric_value is None):
            raise ValueError("metric_name and metric_value go together")
        if self.total is None and self.metric_value is None:
            raise ValueError("Give correct and total, or a metric")
        return self


@router.post("/evals", status_code=201)
def record_eval(
    body: EvalRunIn,
    db: DB,
    settings: Annotated[Settings, Depends(get_settings)],
    x_analyst_service: Annotated[str | None, Header()] = None,
) -> dict:
    """Lets the eval runner (npm run eval -- --post) record a run. Needs the analyst service secret."""
    require_service(settings, x_analyst_service)
    if body.correct is not None and body.total is not None and body.correct > body.total:
        raise HTTPException(status_code=422, detail="correct cannot exceed total")
    run = AnalystEvalRun(
        run_at=_utc(body.run_at) or datetime.now(timezone.utc),
        suite=body.suite,
        label=body.label,
        model=body.model,
        correct=body.correct or 0.0,
        total=body.total or 0,
        metric_name=body.metric_name,
        metric_value=body.metric_value,
        lower_is_better=body.lower_is_better,
        groups=json.dumps({k: v.model_dump() for k, v in body.groups.items()}),
        spend_usd=body.spend_usd,
        notes=body.notes,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return _eval_out(run)


# ---------------------------------------------------------------- Log Pose feedback

FEEDBACK_DAYS = 30


def _feedback_out(f: AnalystFeedback, name: str | None) -> dict:
    return {
        "id": f.id,
        "created_at": _iso(f.created_at),
        "updated_at": _iso(f.updated_at),
        "kind": f.kind,
        "rating": f.rating,
        "note": f.note,
        "answer_excerpt": f.answer_excerpt,
        "question": f.question_excerpt,
        "model": f.model,
        "user_id": f.user_id,
        "user_name": name,
        "thread_id": f.thread_id,
        "message_index": f.message_index,
        "match_id": f.match_id,
    }


@router.get("/feedback")
def list_feedback(
    _: Admin,
    db: DB,
    rating: Annotated[Literal["up", "down", "wrong"] | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0, le=100_000)] = 0,
) -> dict:
    """What players rated Log Pose answers: counts over the last 30 days and the newest ratings first."""
    since = datetime.now(timezone.utc) - timedelta(days=FEEDBACK_DAYS)
    counts = {r: 0 for r in ("up", "down", "wrong")}
    for r, n in db.execute(
        select(AnalystFeedback.rating, func.count()).where(AnalystFeedback.updated_at >= since).group_by(AnalystFeedback.rating)
    ).all():
        if r in counts:
            counts[r] = int(n)
    q = select(AnalystFeedback, User).join(User, User.id == AnalystFeedback.user_id)
    if rating:
        q = q.where(AnalystFeedback.rating == rating)
    rows = db.execute(q.order_by(AnalystFeedback.updated_at.desc(), AnalystFeedback.id.desc()).limit(limit).offset(offset)).all()
    return {"days": FEEDBACK_DAYS, "counts": counts, "items": [_feedback_out(f, duel_display_name(u)) for f, u in rows]}


@router.get("/feedback/export")
def feedback_export(
    db: DB,
    settings: Annotated[Settings, Depends(get_settings)],
    x_analyst_service: Annotated[str | None, Header()] = None,
    rating: Annotated[Literal["up", "down", "wrong"], Query()] = "wrong",
    days: Annotated[int, Query(ge=1, le=3650)] = 90,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
) -> dict:
    """Ratings for the analyst service (npm run feedback-cases): no player names, newest first. Needs the service secret."""
    require_service(settings, x_analyst_service)
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = db.scalars(
        select(AnalystFeedback)
        .where(AnalystFeedback.rating == rating, AnalystFeedback.updated_at >= since)
        .order_by(AnalystFeedback.updated_at.desc(), AnalystFeedback.id.desc())
        .limit(limit)
    ).all()
    return {"items": [{k: v for k, v in _feedback_out(f, None).items() if k not in ("user_id", "user_name")} for f in rows]}


# ---------------------------------------------------------------- hosting

@router.get("/hosting")
def hosting(_: Admin, settings: Annotated[Settings, Depends(get_settings)], refresh: int = 0) -> dict:
    return admin_hosting.hosting(settings, refresh=bool(refresh))


# ---------------------------------------------------------------- users

def _user_row(u: User, matches: int = 0, last_match_at: datetime | None = None) -> dict:
    return {
        "id": u.id,
        "email": u.email,
        "name": u.name,
        "username": u.username,
        "role": u.role,
        "created_at": _iso(u.created_at),
        "banned_at": _iso(u.banned_at),
        "ban_reason": u.ban_reason,
        "matches": matches,
        "last_match_at": _iso(last_match_at),
    }


def _like_escape(q: str) -> str:
    return q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@router.get("/users")
def list_users(
    _: Staff,
    db: DB,
    q: Annotated[str, Query(max_length=100)] = "",
    include_guests: int = 0,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0, le=1_000_000)] = 0,
) -> dict:
    where = []
    if not include_guests:
        where.append(~_is_guest())
    q = q.strip().lower()
    if q:
        pat = f"%{_like_escape(q)}%"
        where.append(
            or_(
                func.lower(User.email).like(pat, escape="\\"),
                func.lower(User.name).like(pat, escape="\\"),
                func.lower(func.coalesce(User.username, "")).like(pat, escape="\\"),
            )
        )
    total = int(db.scalar(select(func.count()).select_from(User).where(*where)) or 0)
    staff_first = case((User.role.in_(("admin", "moderator")), 0), else_=1)
    page = db.scalars(select(User).where(*where).order_by(staff_first, User.created_at.desc(), User.id.desc()).limit(limit).offset(offset)).all()
    stats: dict[int, tuple[int, datetime | None]] = {}
    ids = [u.id for u in page]
    if ids:
        for uid, n, last in db.execute(
            select(DuelMatchSeat.user_id, func.count(), func.max(DuelMatchSeat.created_at))
            .where(DuelMatchSeat.user_id.in_(ids))
            .group_by(DuelMatchSeat.user_id)
        ):
            stats[uid] = (int(n), last)
    return {"total": total, "users": [_user_row(u, *stats.get(u.id, (0, None))) for u in page]}


def _target(db: Session, user_id: int) -> User:
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    return target


class RoleIn(BaseModel):
    role: str = Field(max_length=32)


@router.put("/users/{user_id}/role")
def set_role(user_id: int, body: RoleIn, actor: Admin, db: DB) -> dict:
    if body.role not in ASSIGNABLE_ROLES:
        raise HTTPException(status_code=400, detail="Role must be user or moderator")
    target = _target(db, user_id)
    refusal = can_set_role(actor, target, body.role)
    if refusal:
        raise HTTPException(status_code=403, detail=refusal)
    target.role = body.role
    db.commit()
    db.refresh(target)
    return _user_row(target)


class BanIn(BaseModel):
    reason: str | None = Field(default=None, max_length=200)


@router.post("/users/{user_id}/ban")
def ban_user(user_id: int, actor: Staff, db: DB, body: BanIn | None = None) -> dict:
    target = _target(db, user_id)
    refusal = can_ban(actor, target)
    if refusal:
        raise HTTPException(status_code=403, detail=refusal)
    reason = ((body.reason if body else None) or "").strip()
    target.banned_at = datetime.now(timezone.utc)
    target.ban_reason = reason or None
    target.banned_by = actor.id
    # Signs them out everywhere: every cookie they hold carries the old version.
    target.session_version = int(target.session_version or 0) + 1
    db.commit()
    db.refresh(target)
    return _user_row(target)


@router.post("/users/{user_id}/unban")
def unban_user(user_id: int, actor: Staff, db: DB) -> dict:
    target = _target(db, user_id)
    refusal = can_ban(actor, target)
    if refusal:
        raise HTTPException(status_code=403, detail=refusal)
    target.banned_at = None
    target.ban_reason = None
    target.banned_by = None
    db.commit()
    db.refresh(target)
    return _user_row(target)


@router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: int, actor: Admin, db: DB) -> Response:
    target = _target(db, user_id)
    refusal = can_delete(actor, target)
    if refusal:
        raise HTTPException(status_code=403, detail=refusal)
    # The ORM relationships (decks, owned, extras) cascade here; the DB cascades the rest on Postgres.
    db.delete(target)
    db.flush()
    # SQLite does not enforce foreign keys, so clear the other tables that point at the user by hand:
    # ON DELETE CASCADE rows go, ON DELETE SET NULL rows keep their text and lose the link.
    for table in reversed(Base.metadata.sorted_tables):
        for fk in table.foreign_keys:
            if fk.column.table.name != "users" or table.name == "users":
                continue
            if fk.ondelete == "CASCADE":
                db.execute(table.delete().where(fk.parent == user_id))
            elif fk.ondelete == "SET NULL":
                db.execute(update(table).where(fk.parent == user_id).values({fk.parent.name: None}))
    db.commit()
    return Response(status_code=204)
