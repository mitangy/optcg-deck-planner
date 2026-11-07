"""Duel friends: requests, presence-backed status, and private-room invites."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.statuses import FriendshipStatus
from app.auth import get_current_user
from app.config import Settings, get_settings
from app.core.time import as_utc, utcnow
from app.db import get_db
from app.models import DuelInvite, DuelLobbySeen, DuelPresence, Friendship, User
from app.rate_limit import RateLimiter
from app.schemas import (
    DuelInviteOut,
    FriendInviteIn,
    FriendOut,
    FriendRequestIn,
    FriendRequestOut,
    FriendRequestResult,
    FriendsOut,
)
from app.server_urls import known_game_server_urls, normalize_server_url
from app.social import trades
from app.social.presence import friend_status, friendship, live_presence, pair, room_server_url

router = APIRouter(prefix="/friends", tags=["friends"])

INVITE_TTL = timedelta(minutes=10)
# An invite is sent right after the room is created, before the game-server
# has reported it; give the room this long to show up in presence.
INVITE_ROOM_GRACE = timedelta(seconds=30)
MAX_FRIENDS = 200

_request_rate = RateLimiter(max_calls=20, period_s=60, name="friends_request_rate")
_invite_rate = RateLimiter(max_calls=20, period_s=60, name="friends_invite_rate")


def _other(f: Friendship, me: int) -> int:
    return f.user_high_id if f.user_low_id == me else f.user_low_id


def _mark_seen(db: Session, user_id: int, now: datetime) -> None:
    row = db.get(DuelLobbySeen, user_id)
    if row is None:
        db.add(DuelLobbySeen(user_id=user_id, seen_at=now))
    else:
        row.seen_at = now


def _invite_is_live(
    invite: DuelInvite, presence: dict[int, list[DuelPresence]], now: datetime
) -> bool:
    if as_utc(invite.expires_at) <= now:
        return False
    if now - as_utc(invite.created_at) <= INVITE_ROOM_GRACE:
        return True
    # After the grace window the inviter must still be seated in that room.
    return any(
        r.room_id == invite.room_id and r.role == "player" and r.phase != "finished"
        for r in presence.get(invite.from_user_id, [])
    )


@router.get("", response_model=FriendsOut)
def list_friends(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> FriendsOut:
    now = utcnow()
    _mark_seen(db, user.id, now)
    db.commit()

    rows = db.scalars(
        select(Friendship).where(
            or_(Friendship.user_low_id == user.id, Friendship.user_high_id == user.id)
        )
    ).all()
    invites = db.scalars(select(DuelInvite).where(DuelInvite.to_user_id == user.id)).all()

    other_ids = {_other(f, user.id) for f in rows} | {i.from_user_id for i in invites}
    users = {u.id: u for u in db.scalars(select(User).where(User.id.in_(other_ids)))}
    accepted_ids = [_other(f, user.id) for f in rows if f.status == FriendshipStatus.ACCEPTED]
    presence = live_presence(db, list({*accepted_ids, *(i.from_user_id for i in invites)}), now)
    seen = {
        s.user_id: s.seen_at
        for s in db.scalars(select(DuelLobbySeen).where(DuelLobbySeen.user_id.in_(accepted_ids)))
    }

    friends: list[FriendOut] = []
    incoming: list[FriendRequestOut] = []
    outgoing: list[FriendRequestOut] = []
    for f in rows:
        other = users.get(_other(f, user.id))
        if other is None or not other.username:
            continue
        if f.status == FriendshipStatus.ACCEPTED:
            status, room_id, ranked = friend_status(presence.get(other.id, []), seen.get(other.id), now)
            friends.append(
                FriendOut(
                    user_id=other.id,
                    username=other.username,
                    status=status,
                    room_id=room_id,
                    server_url=room_server_url(presence.get(other.id, []), room_id),
                    ranked=ranked,
                )
            )
        elif f.requester_id == user.id:
            outgoing.append(FriendRequestOut(user_id=other.id, username=other.username))
        else:
            incoming.append(FriendRequestOut(user_id=other.id, username=other.username))

    order = {"in_game": 0, "waiting": 1, "spectating": 2, "online": 3, "offline": 4}
    friends.sort(key=lambda fr: (order.get(fr.status, 9), fr.username.lower()))

    accepted = set(accepted_ids)
    live_invites = [
        DuelInviteOut(
            id=i.id,
            from_user_id=i.from_user_id,
            from_username=users[i.from_user_id].username or "Player",
            room_id=i.room_id,
            # The game server's own report beats what the inviter's client said when it sent the invite.
            server_url=room_server_url(presence.get(i.from_user_id, []), i.room_id) or i.server_url,
            expires_at=int(as_utc(i.expires_at).timestamp()),
        )
        for i in invites
        if i.from_user_id in accepted and i.from_user_id in users and _invite_is_live(i, presence, now)
    ]
    return FriendsOut(friends=friends, incoming=incoming, outgoing=outgoing, invites=live_invites)


@router.post("/requests", response_model=FriendRequestResult)
def send_request(
    body: FriendRequestIn,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> FriendRequestResult:
    if not _request_rate.allow(f"friend-request:{user.id}"):
        raise HTTPException(status_code=429, detail="Too many friend requests. Try again in a minute.")
    target = db.scalar(select(User).where(func.lower(User.username) == body.username.strip().lower()))
    if target is None:
        raise HTTPException(status_code=404, detail="No player has that username.")
    if target.id == user.id:
        raise HTTPException(status_code=400, detail="You can't add yourself.")

    existing = friendship(db, user.id, target.id)
    if existing is not None:
        if existing.status == FriendshipStatus.ACCEPTED:
            raise HTTPException(status_code=409, detail="You're already friends.")
        if existing.requester_id == user.id:
            return FriendRequestResult(status=FriendshipStatus.PENDING)
        # They already asked you: sending one back accepts theirs.
        existing.status = FriendshipStatus.ACCEPTED
        existing.accepted_at = utcnow()
        db.commit()
        return FriendRequestResult(status=FriendshipStatus.ACCEPTED)

    count = db.scalar(
        select(func.count())
        .select_from(Friendship)
        .where(or_(Friendship.user_low_id == user.id, Friendship.user_high_id == user.id))
    )
    if (count or 0) >= MAX_FRIENDS:
        raise HTTPException(status_code=400, detail="Your friends list is full.")

    low, high = pair(user.id, target.id)
    db.add(Friendship(user_low_id=low, user_high_id=high, requester_id=user.id, status=FriendshipStatus.PENDING))
    try:
        db.commit()
    except IntegrityError:
        # They sent one at the same moment; the row exists now.
        db.rollback()
        return FriendRequestResult(status=FriendshipStatus.PENDING)
    return FriendRequestResult(status=FriendshipStatus.PENDING)


@router.post("/requests/{other_id}/accept", response_model=FriendRequestResult)
def accept_request(
    other_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> FriendRequestResult:
    f = friendship(db, user.id, other_id)
    if f is None or f.status != FriendshipStatus.PENDING or f.requester_id == user.id:
        raise HTTPException(status_code=404, detail="No friend request from that player.")
    f.status = FriendshipStatus.ACCEPTED
    f.accepted_at = utcnow()
    db.commit()
    return FriendRequestResult(status=FriendshipStatus.ACCEPTED)


@router.delete("/{other_id}", status_code=204)
def remove_friend(
    other_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> None:
    """Unfriend, decline an incoming request, or cancel an outgoing one."""
    f = friendship(db, user.id, other_id)
    if f is not None:
        db.delete(f)
    db.execute(
        delete(DuelInvite).where(
            or_(
                and_(DuelInvite.from_user_id == user.id, DuelInvite.to_user_id == other_id),
                and_(DuelInvite.from_user_id == other_id, DuelInvite.to_user_id == user.id),
            )
        )
    )
    trades.cancel_between(db, user.id, other_id)
    db.commit()


@router.post("/{other_id}/invite", response_model=DuelInviteOut)
def invite_friend(
    other_id: int,
    body: FriendInviteIn,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> DuelInviteOut:
    if not _invite_rate.allow(f"duel-invite:{user.id}"):
        raise HTTPException(status_code=429, detail="Too many invites. Try again in a minute.")
    f = friendship(db, user.id, other_id)
    if f is None or f.status != FriendshipStatus.ACCEPTED:
        raise HTTPException(status_code=403, detail="You can only invite friends.")
    now = utcnow()
    # One live invite per sender/recipient pair: a new room replaces the old one.
    db.execute(
        delete(DuelInvite).where(DuelInvite.from_user_id == user.id, DuelInvite.to_user_id == other_id)
    )
    # The recipient's client dials this address with its game token: keep only pools this API has handed out.
    server_url = normalize_server_url(body.server_url)
    if server_url not in known_game_server_urls(settings):
        server_url = None
    invite = DuelInvite(
        from_user_id=user.id,
        to_user_id=other_id,
        room_id=body.room_id.strip(),
        server_url=server_url,
        created_at=now,
        expires_at=now + INVITE_TTL,
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return DuelInviteOut(
        id=invite.id,
        from_user_id=user.id,
        from_username=user.username or "Player",
        room_id=invite.room_id,
        server_url=invite.server_url,
        expires_at=int(as_utc(invite.expires_at).timestamp()),
    )


@router.delete("/invites/{invite_id}", status_code=204)
def dismiss_invite(
    invite_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> None:
    """Recipient dismisses (or has used) an invite; the sender may cancel it."""
    db.execute(
        delete(DuelInvite).where(
            DuelInvite.id == invite_id,
            or_(DuelInvite.to_user_id == user.id, DuelInvite.from_user_id == user.id),
        )
    )
    db.commit()
