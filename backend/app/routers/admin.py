"""Admin page API (#667): player and bot analytics, evals, hosting status, and account moderation.

Auth: staff (admin or moderator) for /admin/me and the user list, ban and unban; admin only for
analytics, roles, deletes and hosting; the analyst service secret for POST /admin/evals.
"""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response
from pydantic import AfterValidator, BaseModel, Field, model_validator
from sqlalchemy import and_, case, func, or_, select, update
from sqlalchemy.orm import Session, aliased

from app.admin import hosting as admin_hosting
from app.admin import traffic as admin_traffic
from app.admin.overview import build_overview, bucket_by_day, is_guest, last_days
from app.admin.schemas import (
    AdminBots,
    AdminDayMatches,
    AdminFeedback,
    AdminMe,
    AdminOverview,
    AdminReports,
    AdminUser,
    AdminUserDetail,
    AdminUsers,
    EvalRun,
    FeedbackExport,
    HostingOut,
    ReportRow,
    TrafficOut,
    UploadRestored,
    UploadRow,
    UploadsPage,
)
from app.core.statuses import FriendshipStatus, ReportStatus
from app.core.time import as_utc_or_none
from app.analyst.credit import month_start, spent_since
from app.core.config import Settings, get_settings
from app.core.db import get_db
from app.analyst.models import (
    AnalystAccess,
    AnalystEvalRun,
    AnalystFeedback,
    AnalystThread,
    AnalystUsage,
    BotMatch,
)
from app.all_models import Base
from app.core.models import User
from app.duel.models import (
    DuelCosmetic,
    DuelMatch,
    DuelMatchLog,
    DuelMatchSeat,
    DuelRating,
    DuelSavedDeck,
    DuelSoloGame,
    DuelUserSettings,
    PlayerReport,
    PlayerWarning,
)
from app.planner.models import Deck, Owned
from app.social.models import DuelLobbySeen, Friendship
from app.duel.moderation import REASON_MAX, restore_cosmetic, take_down_cosmetic
from app.usernames import duel_display_name
from app.roles import ASSIGNABLE_ROLES, STAFF_ROLES, can_ban, can_delete, can_set_role, is_admin
from app.core.security import Admin, Staff, require_service
from app.social.presence import ONLINE_TTL, live_presence

router = APIRouter(prefix="/admin", tags=["admin"])

DB = Annotated[Session, Depends(get_db)]


# The windows the admin charts offer (#691); anything else is a 422.
RANGE_DAYS = (7, 14, 30, 90)


def _range_days(v: int) -> int:
    if v not in RANGE_DAYS:
        raise ValueError(f"days must be one of {', '.join(map(str, RANGE_DAYS))}")
    return v


RangeDays = Annotated[int, AfterValidator(_range_days)]
MATCHES_DAY_LIMIT = 200


def _iso(dt: datetime | None) -> str | None:
    dt = as_utc_or_none(dt)
    return dt.isoformat() if dt else None


# ---------------------------------------------------------------- who am I

@router.get("/me", response_model=AdminMe)
def admin_me(user: Staff) -> dict:
    admin = is_admin(user)
    return {"role": user.role, "can": {"analytics": admin, "set_roles": admin, "ban": True, "delete": admin}}


# ---------------------------------------------------------------- players

@router.get("/overview", response_model=AdminOverview)
def overview(_: Admin, db: DB, days: Annotated[RangeDays, Query()] = 30) -> dict:
    return build_overview(db, days)


@router.get("/matches", response_model=AdminDayMatches)
def matches_on_day(_: Admin, db: DB, day: Annotated[date, Query()]) -> dict:
    """Every duel finished on one UTC day (oldest first, at most 200), for the drill-down under the matches chart (#691).

    ``id`` is the match id the replay page takes (/replay/:matchId).
    """
    start = datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc)
    rows = db.scalars(
        select(DuelMatch)
        .where(DuelMatch.created_at >= start, DuelMatch.created_at < start + timedelta(days=1))
        .order_by(DuelMatch.created_at, DuelMatch.id)
        .limit(MATCHES_DAY_LIMIT)
    ).all()
    ids = [m.match_id for m in rows]
    seat_leaders = (
        {(r.match_id, r.seat): r.leader_id for r in db.scalars(select(DuelMatchSeat).where(DuelMatchSeat.match_id.in_(ids)))}
        if ids
        else {}
    )
    user_ids = {uid for m in rows for uid in (m.seat0_user_id, m.seat1_user_id)}
    names = {u.id: duel_display_name(u) for u in db.scalars(select(User).where(User.id.in_(user_ids)))} if user_ids else {}
    return {
        "day": day.isoformat(),
        "matches": [
            {
                "id": m.match_id,
                "created_at": _iso(m.created_at),
                "ranked": bool(m.ranked),
                "turns": m.turns,
                "winner_seat": m.winner_seat,
                "seats": [
                    {
                        "user_id": uid,
                        "name": names.get(uid),
                        "leader_id": leader or seat_leaders.get((m.match_id, n)),
                        "won": m.winner_seat == n,
                    }
                    for n, (uid, leader) in enumerate(((m.seat0_user_id, m.seat0_leader_id), (m.seat1_user_id, m.seat1_leader_id)))
                ],
            }
            for m in rows
        ],
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


@router.get("/bots", response_model=AdminBots)
def bots(_: Admin, db: DB, days: Annotated[RangeDays, Query()] = 14) -> dict:
    now = datetime.now(timezone.utc)
    rows = db.execute(
        select(BotMatch.created_at, BotMatch.batch_id, BotMatch.leader_a, BotMatch.leader_b, BotMatch.winner, BotMatch.turns, BotMatch.first_seat)
        .order_by(BotMatch.created_at, BotMatch.id)
    ).all()
    finished = [r for r in rows if r.winner is not None]
    turns = [r.turns for r in finished if r.turns is not None]
    seated = [r for r in finished if r.first_seat is not None]
    window = last_days(now, days)
    games_by_day = bucket_by_day([r.created_at for r in rows], window)
    finished_by_day = bucket_by_day([r.created_at for r in finished], window)
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
            "by_day": [{"day": d.isoformat(), "games": games_by_day[d], "finished": finished_by_day[d]} for d in window],
        },
        "days": days,
        "evals": [_eval_out(e) for e in evals],
    }


class EvalGroupIn(BaseModel):
    correct: float = Field(ge=0, le=10_000)
    total: int = Field(ge=0, le=10_000)


# The evals that post here (analyst/evals/shared/post.ts); each gets its own trend on the admin page (#679).
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


@router.post("/evals", status_code=201, response_model=EvalRun)
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
        run_at=as_utc_or_none(body.run_at) or datetime.now(timezone.utc),
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


@router.get("/feedback", response_model=AdminFeedback)
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


@router.get("/feedback/export", response_model=FeedbackExport)
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

@router.get("/hosting", response_model=HostingOut)
def hosting(_: Admin, settings: Annotated[Settings, Depends(get_settings)], refresh: int = 0) -> dict:
    return admin_hosting.hosting(settings, refresh=bool(refresh))


@router.get("/traffic", response_model=TrafficOut)
def traffic(_: Admin, settings: Annotated[Settings, Depends(get_settings)], days: Annotated[RangeDays, Query()] = 30, refresh: int = 0) -> dict:
    """Vercel Web Analytics and Render metrics (#1020), read with the owner's tokens and cached for ten minutes."""
    return admin_traffic.traffic(settings, days, refresh=bool(refresh))


# ---------------------------------------------------------------- users

def _parse_signup_source(raw: str | None) -> dict | None:
    """The stored first-touch source, or None when unknown (#905)."""
    if raw is None:
        return None
    try:
        parsed = json.loads(raw)
    except ValueError:
        return None
    return parsed if isinstance(parsed, dict) else None


MODES = ("ranked", "friends", "private", "bot", "practice")


def _user_row(
    u: User,
    matches: int = 0,
    last_match_at: datetime | None = None,
    games: dict[str, int] | None = None,
) -> dict:
    return {
        "id": u.id,
        "email": u.email,
        "name": u.name,
        "username": u.username,
        "role": u.role,
        "created_at": _iso(u.created_at),
        "banned_at": _iso(u.banned_at),
        "ban_reason": u.ban_reason,
        "signup_source": _parse_signup_source(u.signup_source),
        "matches": matches,
        "last_match_at": _iso(last_match_at),
        "games": games if games is not None else {m: 0 for m in MODES},
    }


def _friend_pair_on(me, other):
    """Join condition: ``me`` and ``other`` (user id columns) are an accepted Friendship pair."""
    low = case((me < other, me), else_=other)
    high = case((me < other, other), else_=me)
    return and_(Friendship.status == FriendshipStatus.ACCEPTED, Friendship.user_low_id == low, Friendship.user_high_id == high)


def mode_counts(db: Session, user_ids: list[int]) -> dict[int, dict[str, tuple[int, int]]]:
    """Games and wins per mode for each user: {user_id: {mode: (games, wins)}} (#988).

    ranked = matchmaker games; friends = casual games against an accepted friend (as things stand
    now); private = every other casual game; bot and practice come from duel_solo_games. Four
    grouped queries however many users are asked for.
    """
    out = {uid: {m: (0, 0) for m in MODES} for uid in user_ids}
    if not user_ids:
        return out
    me, opp = DuelMatchSeat, aliased(DuelMatchSeat)
    is_friend = Friendship.id.is_not(None)
    rows = db.execute(
        select(me.user_id, me.ranked, is_friend, func.count(), func.coalesce(func.sum(case((me.won, 1), else_=0)), 0))
        .select_from(me)
        .outerjoin(opp, and_(opp.match_id == me.match_id, opp.seat != me.seat))
        .outerjoin(Friendship, _friend_pair_on(me.user_id, opp.user_id))
        .where(me.user_id.in_(user_ids))
        .group_by(me.user_id, me.ranked, is_friend)
    )
    for uid, ranked, friend, n, wins in rows:
        mode = "ranked" if ranked else ("friends" if friend else "private")
        games, won = out[uid][mode]
        out[uid][mode] = (games + int(n), won + int(wins))
    for uid, mode, n, wins in db.execute(
        select(
            DuelSoloGame.user_id, DuelSoloGame.mode, func.count(),
            func.coalesce(func.sum(case((DuelSoloGame.won.is_(True), 1), else_=0)), 0),
        )
        .where(DuelSoloGame.user_id.in_(user_ids))
        .group_by(DuelSoloGame.user_id, DuelSoloGame.mode)
    ):
        if mode in out[uid]:
            out[uid][mode] = (int(n), int(wins))
    return out


def _counted_row(db: Session, u: User) -> dict:
    """``_user_row`` with the same counts the list shows, for the action endpoints (#991).

    The page merges an action's response over the row it holds, so zeros here would blank the counts.
    """
    modes = mode_counts(db, [u.id])[u.id]
    matches, last = db.execute(
        select(func.count(), func.max(DuelMatchSeat.created_at)).where(DuelMatchSeat.user_id == u.id)
    ).one()
    return _user_row(u, int(matches), last, {m: g for m, (g, _w) in modes.items()})


def _like_escape(q: str) -> str:
    return q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@router.get("/users", response_model=AdminUsers, response_model_exclude_unset=True)
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
        where.append(~is_guest())
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
    staff_first = case((User.role.in_(STAFF_ROLES), 0), else_=1)
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
    modes = mode_counts(db, ids)
    return {
        "total": total,
        "users": [
            _user_row(u, *stats.get(u.id, (0, None)), games={m: g for m, (g, _w) in modes[u.id].items()})
            for u in page
        ],
    }


def _recent_matches(db: Session, user_id: int, limit: int = 25) -> list[dict]:
    """The user's newest duel matches and solo games merged, newest first."""
    me, opp = DuelMatchSeat, aliased(DuelMatchSeat)
    duel = db.execute(
        select(me, opp.user_id, opp.leader_id, DuelMatch.reason)
        .select_from(me)
        .outerjoin(opp, and_(opp.match_id == me.match_id, opp.seat != me.seat))
        .join(DuelMatch, DuelMatch.match_id == me.match_id)
        .where(me.user_id == user_id)
        .order_by(me.created_at.desc(), me.id.desc())
        .limit(limit)
    ).all()
    solo = db.scalars(
        select(DuelSoloGame).where(DuelSoloGame.user_id == user_id).order_by(DuelSoloGame.created_at.desc(), DuelSoloGame.id.desc()).limit(limit)
    ).all()
    opp_ids = {o for _s, o, _l, _r in duel if o is not None and o != user_id}
    names = {u.id: duel_display_name(u) for u in db.scalars(select(User).where(User.id.in_(opp_ids)))} if opp_ids else {}
    friends = set()
    if opp_ids:
        for low, high in db.execute(
            select(Friendship.user_low_id, Friendship.user_high_id).where(
                Friendship.status == FriendshipStatus.ACCEPTED,
                or_(
                    and_(Friendship.user_low_id == user_id, Friendship.user_high_id.in_(opp_ids)),
                    and_(Friendship.user_high_id == user_id, Friendship.user_low_id.in_(opp_ids)),
                ),
            )
        ):
            friends.add(high if low == user_id else low)
    replays = set(db.scalars(select(DuelMatchLog.match_id).where(DuelMatchLog.match_id.in_([s.match_id for s, *_ in duel])))) if duel else set()
    items: list[tuple[datetime, dict]] = []
    for seat, opp_uid, opp_leader, reason in duel:
        mode = "ranked" if seat.ranked else ("friends" if opp_uid in friends else "private")
        has_opp = opp_uid is not None and opp_uid != user_id
        items.append((as_utc_or_none(seat.created_at), {
            "id": seat.match_id, "created_at": _iso(seat.created_at), "mode": mode,
            "leader_id": seat.leader_id, "opponent_leader_id": opp_leader,
            "opponent": {"id": opp_uid, "name": names.get(opp_uid, "Player")} if has_opp else None,
            "bot_level": None, "won": seat.won, "turns": seat.turns, "reason": reason,
            "replay": seat.match_id in replays,
        }))
    for g in solo:
        items.append((as_utc_or_none(g.created_at), {
            "id": g.game_id, "created_at": _iso(g.created_at), "mode": g.mode,
            "leader_id": g.leader_id, "opponent_leader_id": g.opponent_leader_id, "opponent": None,
            "bot_level": g.bot_level, "won": g.won, "turns": g.turns, "reason": g.reason, "replay": False,
        }))
    items.sort(key=lambda t: t[0], reverse=True)
    return [row for _t, row in items[:limit]]


def _top_leaders(db: Session, user_id: int, limit: int = 8) -> list[dict]:
    tally: dict[str, list[int]] = {}
    for leader, n, wins in db.execute(
        select(DuelMatchSeat.leader_id, func.count(), func.coalesce(func.sum(case((DuelMatchSeat.won, 1), else_=0)), 0))
        .where(DuelMatchSeat.user_id == user_id, DuelMatchSeat.leader_id.is_not(None))
        .group_by(DuelMatchSeat.leader_id)
    ):
        tally.setdefault(leader, [0, 0])
        tally[leader][0] += int(n)
        tally[leader][1] += int(wins)
    for leader, n, wins in db.execute(
        select(DuelSoloGame.leader_id, func.count(), func.coalesce(func.sum(case((DuelSoloGame.won.is_(True), 1), else_=0)), 0))
        .where(DuelSoloGame.user_id == user_id, DuelSoloGame.leader_id.is_not(None))
        .group_by(DuelSoloGame.leader_id)
    ):
        tally.setdefault(leader, [0, 0])
        tally[leader][0] += int(n)
        tally[leader][1] += int(wins)
    ranked = sorted(tally.items(), key=lambda kv: (-kv[1][0], kv[0]))[:limit]
    return [{"leader_id": k, "games": v[0], "wins": v[1]} for k, v in ranked]


def _count(db: Session, column, *where) -> int:
    return int(db.scalar(select(func.count()).select_from(column.class_).where(*where)) or 0)


@router.get("/users/{user_id}", response_model=AdminUserDetail, response_model_exclude_unset=True)
def user_detail(user_id: int, _: Staff, db: DB) -> dict:
    """Everything staff may want to know about one account (#988)."""
    u = _target(db, user_id)
    now = datetime.now(timezone.utc)
    modes = mode_counts(db, [user_id])[user_id]
    matches = sum(modes[m][0] for m in ("ranked", "friends", "private"))
    last_match_at = db.scalar(select(func.max(DuelMatchSeat.created_at)).where(DuelMatchSeat.user_id == user_id))
    row = _user_row(u, matches, last_match_at, {m: g for m, (g, _w) in modes.items()})

    lobby = db.scalar(select(DuelLobbySeen.seen_at).where(DuelLobbySeen.user_id == user_id))
    solo_at = db.scalar(select(func.max(DuelSoloGame.created_at)).where(DuelSoloGame.user_id == user_id))
    pose_at = db.scalar(
        select(func.max(AnalystUsage.created_at)).where(AnalystUsage.user_id == user_id, AnalystUsage.outcome == "ok")
    )
    stamps = {"lobby": lobby, "match": last_match_at, "solo": solo_at, "log_pose": pose_at}
    seen = [as_utc_or_none(t) for t in stamps.values() if t is not None]

    presence = [p for p in live_presence(db, [user_id], now).get(user_id, []) if p.phase != "finished"]
    players = [p for p in presence if p.role == "player"]
    here = (players or presence or [None])[0]
    online_now = bool(presence) or (lobby is not None and now - as_utc_or_none(lobby) <= ONLINE_TTL)

    rating = db.get(DuelRating, user_id)
    first_solo = db.scalar(select(func.min(DuelSoloGame.created_at)))

    owned_cards, owned_unique = db.execute(
        select(func.coalesce(func.sum(Owned.qty), 0), func.count()).where(Owned.user_id == user_id, Owned.qty > 0)
    ).one()
    friend_pair = or_(Friendship.user_low_id == user_id, Friendship.user_high_id == user_id)

    access = db.scalar(select(AnalystAccess.status).where(AnalystAccess.user_id == user_id))
    chat_ok = (AnalystUsage.user_id == user_id, AnalystUsage.kind == "chat", AnalystUsage.outcome == "ok")
    month = month_start(now)
    banned_by = db.get(User, u.banned_by) if u.banned_by else None

    return {
        "user": row,
        "last_seen_at": _iso(max(seen)) if seen else None,
        "last_seen": {k: _iso(v) for k, v in stamps.items()},
        "online": {
            "now": online_now,
            "room_role": here.role if here else None,
            "ranked": bool(here.ranked) if here else None,
        },
        "rating": {"rating": rating.rating, "ranked_games": rating.games_played} if rating else None,
        "modes": [{"mode": m, "games": modes[m][0], "wins": modes[m][1]} for m in MODES],
        "solo_tracked_since": _iso(first_solo),
        "top_leaders": _top_leaders(db, user_id),
        "recent_matches": _recent_matches(db, user_id),
        "planner": {
            "decks": _count(db, Deck.id, Deck.user_id == user_id),
            "owned_cards": int(owned_cards),
            "owned_unique": int(owned_unique),
        },
        "duel": {
            "saved_decks": _count(db, DuelSavedDeck.id, DuelSavedDeck.user_id == user_id, DuelSavedDeck.deleted.is_(False)),
            "uploads": _count(db, DuelCosmetic.id, DuelCosmetic.user_id == user_id),
            "uploads_taken_down": _count(db, DuelCosmetic.id, DuelCosmetic.user_id == user_id, DuelCosmetic.taken_down_at.is_not(None)),
            "friends": _count(db, Friendship.id, friend_pair, Friendship.status == FriendshipStatus.ACCEPTED),
            "friend_requests_pending": _count(db, Friendship.id, friend_pair, Friendship.status == FriendshipStatus.PENDING, Friendship.requester_id != user_id),
        },
        "log_pose": {
            "access": access,
            "questions_total": _count(db, AnalystUsage.id, *chat_ok),
            "questions_month": _count(db, AnalystUsage.id, *chat_ok, AnalystUsage.created_at >= month),
            "spend_total_usd": float(db.scalar(select(func.coalesce(func.sum(AnalystUsage.cost_usd), 0.0)).where(AnalystUsage.user_id == user_id)) or 0.0),
            "spend_month_usd": float(spent_since(db, month, user_id)),
            "last_used_at": _iso(pose_at),
            "threads": _count(db, AnalystThread.id, AnalystThread.user_id == user_id),
        },
        "moderation": {
            "reports_against": _count(db, PlayerReport.id, PlayerReport.reported_id == user_id),
            "reports_open": _count(db, PlayerReport.id, PlayerReport.reported_id == user_id, PlayerReport.status == ReportStatus.OPEN),
            "reports_filed": _count(db, PlayerReport.id, PlayerReport.reporter_id == user_id),
            "warnings": _count(db, PlayerWarning.id, PlayerWarning.user_id == user_id),
            "banned_by": {"id": banned_by.id, "name": duel_display_name(banned_by)} if banned_by else None,
        },
    }


def _target(db: Session, user_id: int) -> User:
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    return target


class RoleIn(BaseModel):
    role: str = Field(max_length=32)


@router.put("/users/{user_id}/role", response_model=AdminUser, response_model_exclude_unset=True)
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
    return _counted_row(db, target)


class BanIn(BaseModel):
    reason: str | None = Field(default=None, max_length=200)


@router.post("/users/{user_id}/ban", response_model=AdminUser, response_model_exclude_unset=True)
def ban_user(user_id: int, actor: Staff, db: DB, body: BanIn | None = None) -> dict:
    target = _target(db, user_id)
    _apply_ban(db, actor, target, (body.reason if body else None) or "")
    return _counted_row(db, target)


def _apply_ban(db: Session, actor: User, target: User, reason: str) -> None:
    """Ban ``target`` as ``actor`` (403 when the roles forbid it); shared with report handling."""
    refusal = can_ban(actor, target)
    if refusal:
        raise HTTPException(status_code=403, detail=refusal)
    reason = reason.strip()
    target.banned_at = datetime.now(timezone.utc)
    target.ban_reason = reason or None
    target.banned_by = actor.id
    # Signs them out everywhere: every cookie they hold carries the old version.
    target.session_version = int(target.session_version or 0) + 1
    db.commit()
    db.refresh(target)


@router.post("/users/{user_id}/unban", response_model=AdminUser, response_model_exclude_unset=True)
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
    return _counted_row(db, target)


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


# ---------------------------------------------------------------- player reports (#810)

class ReportNoteIn(BaseModel):
    note: str | None = Field(default=None, max_length=300)


class ReportWarnIn(BaseModel):
    message: str = Field(min_length=1, max_length=300)


def _report_rows(db: Session, reports: list[PlayerReport]) -> list[dict]:
    """ReportRows for these reports, with the per-player counts fetched in a few grouped queries."""
    if not reports:
        return []
    reported_ids = {r.reported_id for r in reports}
    user_ids = reported_ids | {r.reporter_id for r in reports if r.reporter_id} | {
        r.handled_by for r in reports if r.handled_by
    }
    users = {u.id: u for u in db.scalars(select(User).where(User.id.in_(user_ids)))}
    totals = dict(
        db.execute(
            select(PlayerReport.reported_id, func.count())
            .where(PlayerReport.reported_id.in_(reported_ids))
            .group_by(PlayerReport.reported_id)
        ).all()
    )
    opens = dict(
        db.execute(
            select(PlayerReport.reported_id, func.count())
            .where(PlayerReport.reported_id.in_(reported_ids), PlayerReport.status == ReportStatus.OPEN)
            .group_by(PlayerReport.reported_id)
        ).all()
    )
    warnings = dict(
        db.execute(
            select(PlayerWarning.user_id, func.count())
            .where(PlayerWarning.user_id.in_(reported_ids))
            .group_by(PlayerWarning.user_id)
        ).all()
    )
    cosmetic_ids = {r.cosmetic_id for r in reports if r.cosmetic_id}
    down = (
        set(
            db.scalars(
                select(DuelCosmetic.id).where(DuelCosmetic.id.in_(cosmetic_ids), DuelCosmetic.taken_down_at.is_not(None))
            )
        )
        if cosmetic_ids
        else set()
    )
    match_ids = {r.match_id for r in reports if r.match_id}
    finished = (
        set(db.scalars(select(DuelMatch.match_id).where(DuelMatch.match_id.in_(match_ids)))) if match_ids else set()
    )
    out = []
    for r in reports:
        reported = users.get(r.reported_id)
        reporter = users.get(r.reporter_id) if r.reporter_id else None
        handler = users.get(r.handled_by) if r.handled_by else None
        out.append(
            {
                "id": r.id,
                "created_at": _iso(r.created_at),
                "status": r.status,
                "action": r.action,
                "staff_note": r.staff_note,
                "handled_by_name": duel_display_name(handler) if handler else None,
                "handled_at": _iso(r.handled_at),
                "reason": r.reason,
                "image_kind": r.image_kind,
                "note": r.note,
                "match_id": r.match_id,
                "source": r.source,
                "match_finished": bool(r.match_id) and r.match_id in finished,
                "has_image": r.image_data is not None,
                "cosmetic_id": r.cosmetic_id,
                "image_taken_down": r.cosmetic_id in down,
                "reporter": {"id": reporter.id, "name": duel_display_name(reporter)} if reporter else None,
                "reported": {
                    "id": r.reported_id,
                    "name": duel_display_name(reported) if reported else "Player",
                    "role": reported.role if reported else "user",
                    "banned": bool(reported and reported.banned_at is not None),
                    "open_reports": int(opens.get(r.reported_id, 0)),
                    "total_reports": int(totals.get(r.reported_id, 0)),
                    "warnings": int(warnings.get(r.reported_id, 0)),
                },
            }
        )
    return out


def _report_row(db: Session, report: PlayerReport) -> dict:
    return _report_rows(db, [report])[0]


def _open_report(db: Session, report_id: int) -> PlayerReport:
    report = db.get(PlayerReport, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.status != ReportStatus.OPEN:
        raise HTTPException(status_code=409, detail="This report was already handled")
    return report


def _close_report(report: PlayerReport, actor: User, status: str, action: str, note: str | None) -> None:
    report.status = status
    report.action = action
    report.staff_note = (note or "").strip()[:300]
    report.handled_by = actor.id
    report.handled_at = datetime.now(timezone.utc)


@router.get("/reports", response_model=AdminReports)
def list_reports(
    _: Staff,
    db: DB,
    status: Annotated[Literal["open", "all"], Query()] = "open",
    limit: Annotated[int, Query(ge=1, le=200)] = 200,
) -> dict:
    query = select(PlayerReport)
    if status == ReportStatus.OPEN:
        query = query.where(PlayerReport.status == ReportStatus.OPEN)
    reports = db.scalars(query.order_by(PlayerReport.id.desc()).limit(limit)).all()
    return {"reports": _report_rows(db, list(reports))}


@router.get("/reports/{report_id}/image")
def report_image(report_id: int, _: Staff, db: DB) -> Response:
    report = db.get(PlayerReport, report_id)
    if report is None or report.image_data is None:
        raise HTTPException(status_code=404, detail="No image")
    return Response(
        content=report.image_data,
        media_type=report.image_mime or "application/octet-stream",
        headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
    )


@router.post("/reports/{report_id}/dismiss", response_model=ReportRow)
def dismiss_report(report_id: int, actor: Staff, db: DB, body: ReportNoteIn | None = None) -> dict:
    report = _open_report(db, report_id)
    _close_report(report, actor, ReportStatus.DISMISSED, "", body.note if body else None)
    db.commit()
    return _report_row(db, report)


@router.post("/reports/{report_id}/remove-image", response_model=ReportRow)
def remove_reported_image(report_id: int, actor: Staff, db: DB, body: ReportNoteIn | None = None) -> dict:
    report = _open_report(db, report_id)
    note = body.note if body else None
    cosmetic: DuelCosmetic | None = None
    if report.cosmetic_id is not None:
        cosmetic = db.get(DuelCosmetic, report.cosmetic_id)
    elif report.image_kind:
        prefs = db.get(DuelUserSettings, report.reported_id)
        active = (
            prefs.active_playmat_id if report.image_kind == "playmat" else prefs.active_card_back_id
        ) if prefs else None
        cosmetic = db.get(DuelCosmetic, active) if active else None
    if cosmetic is None:
        raise HTTPException(status_code=409, detail="There is no image to remove")
    take_down_cosmetic(db, cosmetic, actor.id, note or f"Report #{report.id}")
    _close_report(report, actor, ReportStatus.ACTIONED, "image_removed", note)
    # Everyone else who reported the same image is answered by the same removal.
    siblings = db.scalars(
        select(PlayerReport).where(
            PlayerReport.id != report.id,
            PlayerReport.status == ReportStatus.OPEN,
            PlayerReport.cosmetic_id == cosmetic.id,
        )
    ).all()
    for other in siblings:
        _close_report(other, actor, ReportStatus.ACTIONED, "image_removed", note)
    db.commit()
    return _report_row(db, report)


@router.post("/reports/{report_id}/warn", response_model=ReportRow)
def warn_reported_player(report_id: int, body: ReportWarnIn, actor: Staff, db: DB) -> dict:
    report = _open_report(db, report_id)
    target = _target(db, report.reported_id)
    refusal = can_ban(actor, target)
    if refusal:
        raise HTTPException(status_code=403, detail=refusal)
    db.add(
        PlayerWarning(user_id=target.id, report_id=report.id, message=body.message.strip(), issued_by=actor.id)
    )
    _close_report(report, actor, ReportStatus.ACTIONED, "warned", body.message)
    db.commit()
    return _report_row(db, report)


@router.post("/reports/{report_id}/ban", response_model=ReportRow)
def ban_reported_player(report_id: int, actor: Staff, db: DB, body: BanIn | None = None) -> dict:
    report = _open_report(db, report_id)
    target = _target(db, report.reported_id)
    reason = (body.reason if body else None) or ""
    _apply_ban(db, actor, target, reason)
    _close_report(report, actor, ReportStatus.ACTIONED, "banned", reason)
    db.commit()
    return _report_row(db, report)


# ---------------------------------------------------------------- uploaded images (#812)

class TakeDownIn(BaseModel):
    reason: str = Field(min_length=1, max_length=REASON_MAX)


def _cosmetic_rows(db: Session, rows: list) -> list[dict]:
    """UploadRows for these (DuelCosmetic columns without the bytes) rows, owners and counts in grouped queries."""
    if not rows:
        return []
    owner_ids = {r.user_id for r in rows}
    ids = {r.id for r in rows}
    users = {u.id: u for u in db.scalars(select(User).where(User.id.in_(owner_ids | {r.taken_down_by for r in rows if r.taken_down_by})))}
    active: set[int] = set()
    for prefs in db.execute(
        select(DuelUserSettings.active_playmat_id, DuelUserSettings.active_card_back_id).where(
            DuelUserSettings.user_id.in_(owner_ids)
        )
    ).all():
        active.update(i for i in prefs if i is not None)
    reports = dict(
        db.execute(
            select(PlayerReport.cosmetic_id, func.count())
            .where(PlayerReport.cosmetic_id.in_(ids))
            .group_by(PlayerReport.cosmetic_id)
        ).all()
    )
    out = []
    for r in rows:
        owner = users.get(r.user_id)
        by = users.get(r.taken_down_by) if r.taken_down_by else None
        out.append(
            {
                "id": r.id,
                "kind": r.kind,
                "mime": r.mime,
                "size": r.size,
                "created_at": _iso(r.created_at),
                "in_use": r.id in active and r.taken_down_at is None,
                "report_count": int(reports.get(r.id, 0)),
                "taken_down_at": _iso(r.taken_down_at),
                "taken_down_by_name": duel_display_name(by) if by else None,
                "taken_down_reason": r.taken_down_reason,
                "owner": {
                    "id": r.user_id,
                    "name": duel_display_name(owner) if owner else "Player",
                    "role": owner.role if owner else "user",
                    "banned": bool(owner and owner.banned_at is not None),
                },
            }
        )
    return out


@router.get("/cosmetics", response_model=UploadsPage)
def list_cosmetics(
    _: Staff,
    db: DB,
    state: Annotated[Literal["live", "taken_down", "all"], Query()] = "live",
    kind: Annotated[Literal["playmat", "cardBack"] | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
    offset: Annotated[int, Query(ge=0)] = 0,
    before_id: Annotated[int | None, Query(ge=1)] = None,
) -> dict:
    """Every uploaded playmat and card back, newest first, for finding one nobody reported. No image bytes.

    `before_id` pages by key (rows strictly older than it) so a take-down between pages skips nothing (#824).
    """
    where = []
    if state == "live":
        where.append(DuelCosmetic.taken_down_at.is_(None))
    elif state == "taken_down":
        where.append(DuelCosmetic.taken_down_at.is_not(None))
    if kind:
        where.append(DuelCosmetic.kind == kind)
    total = db.scalar(select(func.count()).select_from(DuelCosmetic).where(*where)) or 0
    if before_id is not None:
        where.append(DuelCosmetic.id < before_id)
    rows = db.execute(
        select(
            DuelCosmetic.id, DuelCosmetic.user_id, DuelCosmetic.kind, DuelCosmetic.mime, DuelCosmetic.size,
            DuelCosmetic.created_at, DuelCosmetic.taken_down_at, DuelCosmetic.taken_down_by,
            DuelCosmetic.taken_down_reason,
        )
        .where(*where)
        .order_by(DuelCosmetic.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return {"total": int(total), "items": _cosmetic_rows(db, list(rows))}


@router.get("/cosmetics/{cosmetic_id}/image")
def cosmetic_image(cosmetic_id: int, _: Staff, db: DB) -> Response:
    """The stored bytes, taken down or not (a takedown keeps them as evidence)."""
    cosmetic = db.get(DuelCosmetic, cosmetic_id)
    if cosmetic is None:
        raise HTTPException(status_code=404, detail="Image not found")
    return Response(
        content=cosmetic.data,
        media_type=cosmetic.mime or "application/octet-stream",
        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
    )


@router.post("/cosmetics/{cosmetic_id}/take-down", response_model=UploadRow)
def take_down_uploaded_cosmetic(cosmetic_id: int, body: TakeDownIn, actor: Staff, db: DB) -> dict:
    """Remove an upload nobody reported (a copyright notice, say). Soft: the bytes stay as evidence."""
    cosmetic = db.get(DuelCosmetic, cosmetic_id)
    if cosmetic is None:
        raise HTTPException(status_code=404, detail="Image not found")
    reason = body.reason.strip()
    if not reason:
        raise HTTPException(status_code=422, detail="Say why it is being taken down")
    take_down_cosmetic(db, cosmetic, actor.id, reason)
    db.commit()
    return _cosmetic_rows(db, [cosmetic])[0]


@router.post("/cosmetics/{cosmetic_id}/restore", response_model=UploadRestored)
def restore_taken_down_cosmetic(cosmetic_id: int, _: Admin, db: DB) -> dict:
    """Undo an image takedown. The owner has to choose it as active again."""
    cosmetic = db.get(DuelCosmetic, cosmetic_id)
    if cosmetic is None:
        raise HTTPException(status_code=404, detail="Image not found")
    restore_cosmetic(db, cosmetic)
    db.commit()
    return {
        "id": cosmetic.id, "user_id": cosmetic.user_id, "kind": cosmetic.kind, "taken_down": False,
        **_cosmetic_rows(db, [cosmetic])[0],
    }
