"""Short-lived duel state kept in Redis when REDIS_URL is set.

Presence and per-turn progress are rewritten every few seconds by the game
servers. With Redis configured they live here instead of Postgres; readers turn
them back into transient (never added to a session) ``DuelPresence`` /
``DuelMatchProgress`` objects so the rest of the code reads them the same way.

Presence
  ``duel:presence:user:{user_id}``  hash  room_id -> JSON entry (with instance_id
                                    and updated_at); expires PRESENCE_KEY_TTL_S
                                    after the last snapshot that listed the user.
  ``duel:presence:inst:{instance}`` set   "user_id|room_id" of the instance's last
                                    snapshot, so the next one can drop what left.

Progress (games with no result yet)
  ``duel:progress:{match_id}``      JSON snapshot, PROGRESS_TTL_S.
  ``duel:progress:user:{user_id}``  sorted set match_id -> updated_at (epoch s).
"""

from __future__ import annotations

import json
from collections.abc import Iterable
from datetime import datetime, timezone

from app.models import DuelMatchProgress, DuelPresence

# Snapshots land every ~15 s; readers also skip entries older than friends.PRESENCE_TTL.
PRESENCE_KEY_TTL_S = 60
# A game nobody has touched for this long is gone from the unfinished list.
PROGRESS_TTL_S = 6 * 3600


def _presence_user_key(user_id: int) -> str:
    return f"duel:presence:user:{user_id}"


def _presence_inst_key(instance_id: str) -> str:
    return f"duel:presence:inst:{instance_id}"


def _progress_key(match_id: str) -> str:
    return f"duel:progress:{match_id}"


def _progress_user_key(user_id: int) -> str:
    return f"duel:progress:user:{user_id}"


def _parse_time(value: str) -> datetime:
    when = datetime.fromisoformat(value)
    return when if when.tzinfo else when.replace(tzinfo=timezone.utc)


# --- presence -----------------------------------------------------------------


def write_presence_snapshot(r, instance_id: str, entries: Iterable, now: datetime) -> None:
    """Replace one game-server process's presence with ``entries`` (already filtered and de-duplicated)."""
    entries = list(entries)
    members = {f"{e.user_id}|{e.room_id}" for e in entries}
    previous = r.smembers(_presence_inst_key(instance_id))
    gone = [m.split("|", 1) for m in previous if m not in members]
    owners = []
    if gone:
        pipe = r.pipeline(transaction=False)
        for uid, room in gone:
            pipe.hget(_presence_user_key(int(uid)), room)
        owners = pipe.execute()

    pipe = r.pipeline(transaction=True)
    for (uid, room), raw in zip(gone, owners):
        # A room that moved to another process belongs to that process's snapshot now.
        if raw and json.loads(raw).get("instance_id") == instance_id:
            pipe.hdel(_presence_user_key(int(uid)), room)
    stamp = now.isoformat()
    for e in entries:
        key = _presence_user_key(e.user_id)
        pipe.hset(
            key,
            e.room_id,
            json.dumps(
                {"instance_id": instance_id, "role": e.role, "phase": e.phase, "ranked": e.ranked, "updated_at": stamp},
                separators=(",", ":"),
            ),
        )
        pipe.expire(key, PRESENCE_KEY_TTL_S)
    inst_key = _presence_inst_key(instance_id)
    pipe.delete(inst_key)
    if members:
        pipe.sadd(inst_key, *members)
        pipe.expire(inst_key, PRESENCE_KEY_TTL_S)
    pipe.execute()


def read_presence(r, user_ids: list[int]) -> list[DuelPresence]:
    """Every presence entry of these users (freshness is the caller's call)."""
    pipe = r.pipeline(transaction=False)
    for uid in user_ids:
        pipe.hgetall(_presence_user_key(uid))
    rows: list[DuelPresence] = []
    for uid, fields in zip(user_ids, pipe.execute()):
        for room_id, raw in (fields or {}).items():
            data = json.loads(raw)
            rows.append(
                DuelPresence(
                    user_id=uid,
                    room_id=room_id,
                    instance_id=data.get("instance_id", ""),
                    role=data.get("role", "player"),
                    phase=data.get("phase", "playing"),
                    ranked=bool(data.get("ranked", False)),
                    updated_at=_parse_time(data["updated_at"]),
                )
            )
    return rows


# --- per-turn progress --------------------------------------------------------

_PROGRESS_FIELDS = (
    "seat0_user_id",
    "seat1_user_id",
    "ranked",
    "seat0_leader_id",
    "seat1_leader_id",
    "turns",
    "replay",
    "seat0_log",
    "seat1_log",
)


def read_progress(r, match_id: str) -> DuelMatchProgress | None:
    raw = r.get(_progress_key(match_id))
    return _progress_from_json(match_id, raw) if raw else None


def _progress_from_json(match_id: str, raw: str) -> DuelMatchProgress:
    data = json.loads(raw)
    row = DuelMatchProgress(match_id=match_id, **{f: data.get(f) for f in _PROGRESS_FIELDS})
    row.ranked = bool(row.ranked)
    row.updated_at = _parse_time(data["updated_at"])
    return row


def write_progress(r, row: DuelMatchProgress) -> None:
    """Store the latest snapshot and index it under both players."""
    data = {f: getattr(row, f) for f in _PROGRESS_FIELDS}
    data["updated_at"] = row.updated_at.isoformat()
    score = row.updated_at.timestamp()
    pipe = r.pipeline(transaction=True)
    pipe.set(_progress_key(row.match_id), json.dumps(data, separators=(",", ":")), ex=PROGRESS_TTL_S)
    for uid in (row.seat0_user_id, row.seat1_user_id):
        pipe.zadd(_progress_user_key(uid), {row.match_id: score})
        # Index entries older than the snapshots themselves point at nothing.
        pipe.zremrangebyscore(_progress_user_key(uid), "-inf", score - PROGRESS_TTL_S)
        pipe.expire(_progress_user_key(uid), PROGRESS_TTL_S)
    pipe.execute()


def delete_progress(r, match_id: str, user_ids: Iterable[int]) -> None:
    pipe = r.pipeline(transaction=True)
    pipe.delete(_progress_key(match_id))
    for uid in user_ids:
        pipe.zrem(_progress_user_key(uid), match_id)
    pipe.execute()


def user_progress(r, user_id: int, limit: int) -> list[DuelMatchProgress]:
    """A player's unfinished games in Redis, newest first."""
    match_ids = r.zrevrange(_progress_user_key(user_id), 0, limit - 1)
    if not match_ids:
        return []
    raws = r.mget([_progress_key(m) for m in match_ids])
    return [_progress_from_json(m, raw) for m, raw in zip(match_ids, raws) if raw]
