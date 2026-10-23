/**
 * Ground truth for the review-facts eval (#675): what really happened in a game, read from the engine replay.
 * Turn numbers are counted exactly as narrate() in src/matches.ts counts them, so they match the
 * "--- Turn N" headers the review model reads. Events are the raw ones (not the seat-projected ones).
 */
import { getCardDef, replayMatch, type GameEvent, type MatchReplay, type MatchState, type Seat } from "@optcg/rules";

export type Play = { seat: Seat; card: string; name: string };
export type Attack = {
  seat: Seat;
  attacker: string;
  attackerName: string;
  /** "leader" or the defId of the Character attacked (as declared; a block does not change it). */
  target: string;
  targetName: string;
  attackerPower: number;
  defenderPower: number;
  blockedBy?: string;
  counters: string[];
  hit: boolean;
};
export type Ko = { seat: Seat; card: string; name: string };
export type LifeTaken = { seat: Seat; card: string; name: string };
export type TriggerAccepted = { seat: Seat; card?: string; name?: string };

export type TurnFacts = {
  turn: number;
  activeSeat: Seat;
  plays: Play[];
  attacks: Attack[];
  kos: Ko[];
  lifeTaken: LifeTaken[];
  triggersAccepted: TriggerAccepted[];
  lifeAtStart: [number, number];
  lifeAtEnd: [number, number];
  /** Lowest and highest Life each seat had at any point of the turn. */
  lifeRange: [[number, number], [number, number]];
};

export type GameFacts = {
  firstSeat: Seat;
  /** Whether each seat took a mulligan; null when mulligans were skipped. */
  mulligans: [boolean | null, boolean | null];
  turns: TurnFacts[];
  result: { winner: Seat | null; reason: string | null; finalTurn: number };
  leaders: [string, string];
  /** Every card id in either deck or leader slot: the cards that could have been in the game. */
  universe: string[];
  /** Every Life total each seat had at any point. */
  lifeSeen: [number[], number[]];
  finalLife: [number, number];
  divergedAt?: string;
};

export const nameOfCard = (id: string): string => {
  try {
    return getCardDef(id).name;
  } catch {
    return id;
  }
};

const lifeOf = (s: MatchState): [number, number] => [s.players[0].life.length, s.players[1].life.length];

export function gameFacts(replay: MatchReplay): GameFacts {
  const opening = replayMatch({ ...replay, intents: [] });
  const defOf = new Map<string, string>();
  const learn = (s: MatchState) => {
    for (const p of s.players) for (const c of [p.leader, ...p.characters, ...(p.stage ? [p.stage] : []), ...p.hand, ...p.resolving]) defOf.set(c.id, c.defId);
  };
  const turns = new Map<number, TurnFacts>();
  const lifeSeen: [Set<number>, Set<number>] = [new Set(), new Set()];
  const seeLife = (s: MatchState) => {
    const l = lifeOf(s);
    lifeSeen[0].add(l[0]);
    lifeSeen[1].add(l[1]);
    return l;
  };
  const open = (turn: number, activeSeat: Seat, life: [number, number]) => {
    const t: TurnFacts = {
      turn,
      activeSeat,
      plays: [],
      attacks: [],
      kos: [],
      lifeTaken: [],
      triggersAccepted: [],
      lifeAtStart: life,
      lifeAtEnd: life,
      lifeRange: [[life[0], life[0]], [life[1], life[1]]],
    };
    turns.set(turn, t);
    return t;
  };
  const widen = (t: TurnFacts, life: [number, number]) => {
    t.lifeAtEnd = life;
    for (const s of [0, 1] as const) t.lifeRange[s] = [Math.min(t.lifeRange[s][0], life[s]), Math.max(t.lifeRange[s][1], life[s])];
  };

  const mulligans: [boolean | null, boolean | null] = [null, null];
  let turn = opening.turnNumber;
  let current: TurnFacts | null = null;
  learn(opening);
  let prev = opening;
  seeLife(opening);
  if (opening.phase !== "mulligan") current = open(turn, opening.activeSeat, lifeOf(opening));
  let divergedAt: string | undefined;
  let last = opening;
  const pendingTrigger: Record<number, string | undefined> = {};
  let openAttack: Attack | null = null;

  const handle = (e: GameEvent, step: { state: MatchState }, before: MatchState) => {
    switch (e.type) {
      case "mulligan_resolved":
        mulligans[e.seat] = e.didMulligan;
        return;
      case "phase_changed":
        // The engine starts every turn (extra turns included) with a refresh phase and counts it.
        if (e.phase === "refresh") {
          if (current) widen(current, lifeOf(before));
          turn += 1;
          current = open(turn, e.activeSeat, lifeOf(step.state));
          openAttack = null;
        }
        return;
      default:
    }
    if (!current) return;
    switch (e.type) {
      case "card_played":
        defOf.set(e.instanceId, e.defId);
        current.plays.push({ seat: e.seat, card: e.defId, name: nameOfCard(e.defId) });
        return;
      case "attack_declared": {
        const attacker = defOf.get(e.attackerId) ?? "unknown";
        const target = e.target.kind === "leader" ? "leader" : (defOf.get(e.target.instanceId) ?? "unknown");
        openAttack = {
          seat: e.seat,
          attacker,
          attackerName: nameOfCard(attacker),
          target,
          targetName: target === "leader" ? "leader" : nameOfCard(target),
          attackerPower: e.attackerPower,
          defenderPower: e.defenderPower,
          counters: [],
          hit: false,
        };
        current.attacks.push(openAttack);
        return;
      }
      case "blocked":
        if (openAttack) openAttack.blockedBy = defOf.get(e.blockerId);
        return;
      case "counter_applied":
        openAttack?.counters.push(e.defId);
        return;
      case "battle_resolved":
        if (openAttack) {
          openAttack.hit = e.attackerWon;
          openAttack = null;
        }
        return;
      case "character_ko":
        current.kos.push({ seat: e.seat, card: e.defId, name: nameOfCard(e.defId) });
        return;
      case "life_taken":
        current.lifeTaken.push({ seat: e.seat, card: e.defId, name: nameOfCard(e.defId) });
        // An accepted Trigger that was not announced is the Life card just taken.
        pendingTrigger[e.seat] = e.defId;
        return;
      case "trigger_available":
        pendingTrigger[e.seat] = e.defId;
        return;
      case "trigger_resolved": {
        const card = pendingTrigger[e.seat];
        pendingTrigger[e.seat] = undefined;
        if (e.accepted) current.triggersAccepted.push({ seat: e.seat, ...(card ? { card, name: nameOfCard(card) } : {}) });
        return;
      }
      default:
    }
  };

  try {
    replayMatch(replay, (step) => {
      learn(step.state);
      for (const e of step.events) handle(e, step, prev);
      const life = seeLife(step.state);
      if (current) widen(current, life);
      prev = step.state;
      last = step.state;
    });
  } catch (err) {
    divergedAt = err instanceof Error ? err.message : String(err);
  }

  const winner = replay.end?.winner ?? last.winner ?? null;
  const reason = replay.end?.reason ?? last.winReason ?? null;
  const universe = [...new Set([...replay.players.flatMap((p) => [p.leaderId, ...p.deck])])];
  return {
    firstSeat: replay.firstSeat,
    mulligans,
    turns: [...turns.values()].sort((a, b) => a.turn - b.turn),
    result: { winner, reason, finalTurn: last.turnNumber },
    leaders: [replay.players[0].leaderId, replay.players[1].leaderId],
    universe,
    lifeSeen: [[...lifeSeen[0]], [...lifeSeen[1]]],
    finalLife: lifeOf(last),
    ...(divergedAt ? { divergedAt } : {}),
  };
}

/** Seat-relative view: the review's seat is "you". */
export const seatOf = (actor: "you" | "opponent", seat: Seat): Seat => (actor === "you" ? seat : ((1 - seat) as Seat));
export const actorOf = (s: Seat, seat: Seat): "you" | "opponent" => (s === seat ? "you" : "opponent");
