import { lookupCard } from "../cards/atlas";

export type BattleLogEntry = {
  id: string;
  turn: number;
  text: string;
};

type LooseEvent = { type?: string; [key: string]: unknown };

function cardName(defId: unknown): string {
  if (typeof defId !== "string") return "a card";
  return lookupCard(defId).name;
}

function seatLabel(seat: unknown, youSeat: number | null): string {
  if (typeof seat !== "number") return "A player";
  if (youSeat === 0 || youSeat === 1) {
    return seat === youSeat ? "You" : "Opponent";
  }
  return `Seat ${seat}`;
}

function isYou(seat: unknown, youSeat: number | null): boolean {
  return (youSeat === 0 || youSeat === 1) && seat === youSeat;
}

/** "You play" / "Opponent plays" */
function act(
  seat: unknown,
  youSeat: number | null,
  youVerb: string,
  theyVerb: string,
): string {
  const who = seatLabel(seat, youSeat);
  return `${who} ${isYou(seat, youSeat) ? youVerb : theyVerb}`;
}

/**
 * Narrate raw `events` payloads from the game server.
 * Event `type` strings must match `@optcg/rules` `GameEvent` (no rules import in SPA).
 */
export function narrateEvents(
  events: readonly unknown[],
  opts: { youSeat: number | null; turnNumber: number },
): BattleLogEntry[] {
  const out: BattleLogEntry[] = [];
  let i = 0;
  for (const raw of events) {
    const e = raw as LooseEvent;
    const text = narrateOne(e, opts.youSeat);
    if (!text) continue;
    out.push({
      id: `${opts.turnNumber}-${e.type ?? "evt"}-${i++}-${Math.random()
        .toString(36)
        .slice(2, 7)}`,
      turn: opts.turnNumber,
      text,
    });
  }
  return out;
}

function narrateOne(e: LooseEvent, youSeat: number | null): string | null {
  switch (e.type) {
    case "mulligan_resolved":
      return `${act(
        e.seat,
        youSeat,
        e.didMulligan ? "mulligan" : "keep",
        e.didMulligan ? "mulligans" : "keeps",
      )} opening hand`;
    case "phase_changed":
      if (e.phase === "main") {
        return `—— Main phase · ${seatLabel(e.activeSeat, youSeat)} ——`;
      }
      return `Phase → ${String(e.phase)}`;
    case "drew":
      return `${act(e.seat, youSeat, "draw", "draws")} ${Number(e.count) || 1}`;
    case "don_placed":
      return `${act(e.seat, youSeat, "place", "places")} ${Number(e.count) || 0} DON!!`;
    case "card_played":
      return `${act(e.seat, youSeat, "play", "plays")} ${cardName(e.defId)}`;
    case "stage_replaced":
      return `${act(e.seat, youSeat, "replace", "replaces")} Stage (trashes ${cardName(e.trashedDefId)})`;
    case "character_trashed_for_space":
      return `${act(e.seat, youSeat, "trash", "trashes")} ${cardName(e.defId)} for board space`;
    case "don_given": {
      const name =
        typeof e.targetDefId === "string" ? cardName(e.targetDefId) : "a card";
      const pow =
        typeof e.newPower === "number" ? ` → ${e.newPower} power` : "";
      return `${act(e.seat, youSeat, "attach", "attaches")} DON!! to ${name}${pow}`;
    }
    case "attack_declared": {
      const target = e.target as { kind?: string } | undefined;
      const tgt = target?.kind === "leader" ? "Leader" : "a Character";
      const atk =
        typeof e.attackerPower === "number" ? e.attackerPower : null;
      const def =
        typeof e.defenderPower === "number" ? e.defenderPower : null;
      const pow =
        atk != null && def != null ? ` (${atk} vs ${def})` : "";
      return `${act(e.seat, youSeat, "attack", "attacks")} ${tgt}${pow}`;
    }
    case "blocked":
      return `${act(e.seat, youSeat, "block", "blocks")}`;
    case "counter_applied":
      return `${act(e.seat, youSeat, "counter", "counters")} with ${cardName(e.defId)} (+${Number(e.bonus) || 0})`;
    case "battle_resolved": {
      const atk =
        typeof e.attackerPower === "number" ? e.attackerPower : null;
      const def =
        typeof e.defenderPower === "number" ? e.defenderPower : null;
      const pow =
        atk != null && def != null ? ` (${atk} vs ${def})` : "";
      return `Battle ${e.attackerWon ? "hits" : "fails"}${pow}`;
    }
    case "character_ko":
      return `${seatLabel(e.seat, youSeat)}'s ${cardName(e.defId)} is K.O.'d`;
    case "life_taken":
      return `${act(e.seat, youSeat, "take", "takes")} Life (${cardName(e.defId)}${
        e.toHand ? " → hand" : ", Trigger pending"
      })`;
    case "trigger_available":
      return `${seatLabel(e.seat, youSeat)} Trigger available (${cardName(e.defId)})`;
    case "trigger_resolved":
      return `${seatLabel(e.seat, youSeat)} Trigger ${e.accepted ? "accepted" : "declined"}`;
    case "pending_choice_added": {
      const kind = typeof e.kind === "string" ? e.kind.replace(/_/g, " ") : "ability";
      return `${seatLabel(e.seat, youSeat)} may resolve ${cardName(e.cardDefId)}'s ${kind}`;
    }
    case "pending_choice_resolved": {
      const kind = typeof e.kind === "string" ? e.kind.replace(/_/g, " ") : "ability";
      const verb = e.accepted
        ? act(e.seat, youSeat, "accept", "accepts")
        : act(e.seat, youSeat, "decline", "declines");
      return `${verb} ${cardName(e.cardDefId)}'s ${kind}`;
    }
    case "game_over":
      return `★ ${seatLabel(e.winner, youSeat)} wins (${String(e.reason)})`;
    default:
      return null;
  }
}

/** Group flat entries into turn sections (ascending turn number). */
export function groupBattleLogByTurn(
  entries: readonly BattleLogEntry[],
): { turn: number; lines: BattleLogEntry[] }[] {
  const map = new Map<number, BattleLogEntry[]>();
  for (const e of entries) {
    const list = map.get(e.turn) ?? [];
    list.push(e);
    map.set(e.turn, list);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([turn, lines]) => ({ turn, lines }));
}
