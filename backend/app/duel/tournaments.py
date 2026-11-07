"""Friends tournaments: bracket and schedule maths, standings, and the DB steps that move a bracket along."""

from __future__ import annotations

import logging
import math
import secrets
from typing import NamedTuple, Protocol

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.statuses import TournamentMatchStatus, TournamentPlayerStatus, TournamentStatus
from app.core.time import utcnow
from app.duel.models import DuelTournament, DuelTournamentMatch, DuelTournamentPlayer

log = logging.getLogger("duel_tournaments")

SIZES = (4, 8, 16)
RR_MIN, RR_MAX = 3, 8


def player_limits(format: str, size: int) -> tuple[int, int]:
    """(fewest, most) joined players. A bracket needs more than half full so no bye meets a bye."""
    if format == "single_elim":
        return size // 2 + 1, size
    return RR_MIN, size


def bracket_order(size: int) -> list[int]:
    """Seed numbers in bracket position order; neighbours meet in round 1 (1 v size, ...)."""
    order = [1, 2]
    while len(order) < size:
        n = len(order) * 2
        order = [x for s in order for x in (s, n + 1 - s)]
    return order


def first_round(size: int, seeded_ids: list[int]) -> list[tuple[int | None, int | None]]:
    """Round 1 pairings. Seeds nobody filled are byes, so byes go to the top seeds."""
    order = bracket_order(size)

    def who(seed: int) -> int | None:
        return seeded_ids[seed - 1] if seed <= len(seeded_ids) else None

    return [(who(order[i]), who(order[i + 1])) for i in range(0, size, 2)]


def rounds_for(size: int) -> int:
    return int(math.log2(size))


def next_slot(round: int, slot: int) -> tuple[int, int, str]:
    """Where the winner of (round, slot) goes: (round, slot, side)."""
    return round + 1, slot // 2, "a" if slot % 2 == 0 else "b"


def round_robin_schedule(ids: list[int]) -> list[list[tuple[int, int]]]:
    """Circle method: every pair once; with an odd count one player sits out each round."""
    ring: list[int | None] = list(ids)
    if len(ring) % 2:
        ring.append(None)
    n = len(ring)
    rounds: list[list[tuple[int, int]]] = []
    for _ in range(n - 1):
        pairs = [(ring[i], ring[n - 1 - i]) for i in range(n // 2)]
        rounds.append([(a, b) for a, b in pairs if a is not None and b is not None])
        ring = [ring[0], ring[-1], *ring[1:-1]]
    return rounds


class _Pairing(Protocol):
    player_a_id: int | None
    player_b_id: int | None
    winner_id: int | None
    status: str


class Row(NamedTuple):
    user_id: int
    wins: int
    losses: int
    played: int
    rank: int


def standings(player_ids_by_seed: list[int], matches: list[_Pairing]) -> list[Row]:
    """Wins, then head-to-head wins among the players tied on wins, then seed. Equal on both share a rank."""
    done = [m for m in matches if m.status == TournamentMatchStatus.DONE and m.winner_id is not None]
    wins = {p: 0 for p in player_ids_by_seed}
    played = {p: 0 for p in player_ids_by_seed}
    for m in done:
        for p in (m.player_a_id, m.player_b_id):
            if p in played:
                played[p] += 1
        if m.winner_id in wins:
            wins[m.winner_id] += 1

    h2h: dict[int, int] = {}
    for p in player_ids_by_seed:
        tied = {q for q in player_ids_by_seed if wins[q] == wins[p]}
        h2h[p] = sum(1 for m in done if m.winner_id == p and {m.player_a_id, m.player_b_id} <= tied)

    seed = {p: i for i, p in enumerate(player_ids_by_seed)}
    ordered = sorted(player_ids_by_seed, key=lambda p: (-wins[p], -h2h[p], seed[p]))
    rows: list[Row] = []
    for i, p in enumerate(ordered):
        if i and (wins[p], h2h[p]) == (wins[ordered[i - 1]], h2h[ordered[i - 1]]):
            rank = rows[-1].rank
        else:
            rank = i + 1
        rows.append(Row(p, wins[p], played[p] - wins[p], played[p], rank))
    return rows


def round_robin_winner(rows: list[Row]) -> int | None:
    """The sole rank 1 once everyone has played everyone, else None."""
    if not rows or any(r.played != len(rows) - 1 for r in rows):
        return None
    top = [r for r in rows if r.rank == 1]
    return top[0].user_id if len(top) == 1 else None


def round_robin_rounds(players: int) -> int:
    return players - 1 if players % 2 == 0 else players


def total_rounds(t: DuelTournament, joined: int) -> int:
    if t.format == "single_elim":
        return rounds_for(t.size)
    return round_robin_rounds(joined)


def joined_ids_by_seed(db: Session, t: DuelTournament) -> list[int]:
    rows = db.scalars(
        select(DuelTournamentPlayer).where(
            DuelTournamentPlayer.tournament_id == t.id, DuelTournamentPlayer.status == TournamentPlayerStatus.JOINED
        )
    ).all()
    return [p.user_id for p in sorted(rows, key=lambda p: (p.seed is None, p.seed or 0, p.id))]


def start(db: Session, t: DuelTournament) -> None:
    """Seed the joined players at random, drop open invites, build the matches and resolve byes."""
    players = list(
        db.scalars(
            select(DuelTournamentPlayer).where(
                DuelTournamentPlayer.tournament_id == t.id, DuelTournamentPlayer.status == TournamentPlayerStatus.JOINED
            )
        )
    )
    secrets.SystemRandom().shuffle(players)
    for i, p in enumerate(players):
        p.seed = i + 1
    db.execute(
        delete(DuelTournamentPlayer).where(
            DuelTournamentPlayer.tournament_id == t.id, DuelTournamentPlayer.status == TournamentPlayerStatus.INVITED
        )
    )
    ids = [p.user_id for p in players]
    t.status = TournamentStatus.RUNNING
    t.started_at = utcnow()

    def add(round: int, slot: int, a: int | None, b: int | None, status: str) -> DuelTournamentMatch:
        m = DuelTournamentMatch(
            tournament_id=t.id, round=round, slot=slot, player_a_id=a, player_b_id=b, status=status
        )
        db.add(m)
        return m

    byes: list[DuelTournamentMatch] = []
    if t.format == "single_elim":
        for slot, (a, b) in enumerate(first_round(t.size, ids)):
            m = add(1, slot, a, b, "ready" if a and b else "waiting")
            if (a is None) != (b is None):
                byes.append(m)
        for r in range(2, rounds_for(t.size) + 1):
            for slot in range(t.size // 2**r):
                add(r, slot, None, None, "waiting")
    else:
        for r, pairs in enumerate(round_robin_schedule(ids), start=1):
            for slot, (a, b) in enumerate(pairs):
                add(r, slot, a, b, "ready")
    db.flush()
    for m in byes:
        decide(db, t, m, m.player_a_id or m.player_b_id, "bye")


def decide(
    db: Session,
    t: DuelTournament,
    m: DuelTournamentMatch,
    winner_id: int,
    decided_by: str,
    result_match_id: str | None = None,
) -> None:
    """Record a result and move the bracket along. The caller commits."""
    m.winner_id = winner_id
    m.status = TournamentMatchStatus.DONE
    m.decided_by = decided_by
    m.result_match_id = result_match_id
    m.finished_at = utcnow()
    db.flush()

    if t.format == "single_elim":
        if m.round >= rounds_for(t.size):
            t.status = TournamentStatus.FINISHED
            t.winner_id = winner_id
            t.finished_at = utcnow()
            return
        nr, ns, side = next_slot(m.round, m.slot)
        nxt = db.scalar(
            select(DuelTournamentMatch)
            .where(
                DuelTournamentMatch.tournament_id == t.id,
                DuelTournamentMatch.round == nr,
                DuelTournamentMatch.slot == ns,
            )
            .with_for_update()
        )
        if nxt is None:
            return
        if side == "a":
            nxt.player_a_id = winner_id
        else:
            nxt.player_b_id = winner_id
        if nxt.player_a_id and nxt.player_b_id and nxt.status == TournamentMatchStatus.WAITING:
            nxt.status = TournamentMatchStatus.READY
        return

    matches = list(db.scalars(select(DuelTournamentMatch).where(DuelTournamentMatch.tournament_id == t.id)))
    if all(x.status == TournamentMatchStatus.DONE for x in matches):
        rows = standings(joined_ids_by_seed(db, t), matches)
        t.status = TournamentStatus.FINISHED
        t.winner_id = round_robin_winner(rows)
        t.finished_at = utcnow()


def record_game(
    db: Session, match_id: str, seat0_user_id: int, seat1_user_id: int, winner_seat: int
) -> bool:
    """A finished game: if it was a ready tournament match's room between exactly these two, record it.

    Only game 1 of a room has ``match_id == room id``; rematches (``<room>-r1``) never match. Commits on success.
    """
    m = db.scalar(
        select(DuelTournamentMatch)
        .join(DuelTournament, DuelTournament.id == DuelTournamentMatch.tournament_id)
        .where(
            DuelTournamentMatch.room_id == match_id,
            DuelTournamentMatch.status == TournamentMatchStatus.READY,
            DuelTournament.status == TournamentStatus.RUNNING,
        )
        .with_for_update()
    )
    if m is None or {m.player_a_id, m.player_b_id} != {seat0_user_id, seat1_user_id}:
        return False
    t = db.scalar(select(DuelTournament).where(DuelTournament.id == m.tournament_id).with_for_update())
    if t is None or t.status != TournamentStatus.RUNNING:
        return False
    winner = seat0_user_id if winner_seat == 0 else seat1_user_id
    decide(db, t, m, winner, "game", match_id)
    db.commit()
    return True
