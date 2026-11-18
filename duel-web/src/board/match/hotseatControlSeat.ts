import type { PendingChoiceView, PlayerView, Seat } from "../../net/protocol";

type BattleWire = {
  attackerSeat?: Seat;
};

function frontPendingChoice(
  ...views: Array<PlayerView | null | undefined>
): PendingChoiceView | undefined {
  for (const view of views) {
    const front = view?.pendingChoices?.[0];
    if (front) return front;
  }
  return undefined;
}

const BLOCK_COUNTER_INTENT_TYPES = new Set([
  "pass_block",
  "declare_block",
  "pass_counter",
  "counter_from_hand",
  "counter_event",
]);

function seatHasBlockOrCounterIntents(
  view: PlayerView | null | undefined,
): boolean {
  return (
    view?.legalIntents?.some((i) => BLOCK_COUNTER_INTENT_TYPES.has(i.type)) ??
    false
  );
}

// During block/counter, do NOT hand to the defender while pending is briefly empty after declare_attack: Rocks/Teach triggers arrive a tick later and `pass_block` is illegal until they resolve.
// Either socket can lag during Colyseus event/view delivery, so pass both seat views when available.
export function hotseatControlSeat(
  view: PlayerView | null | undefined,
  seat0View?: PlayerView | null,
  seat1View?: PlayerView | null,
): Seat | null {
  const v0 = seat0View ?? (view?.seat === 0 ? view : null);
  const v1 = seat1View ?? (view?.seat === 1 ? view : null);
  const primary = view ?? v0 ?? v1;
  if (!primary) return null;

  const front = frontPendingChoice(v0, v1, primary);
  if (front && (front.seat === 0 || front.seat === 1)) {
    return front.seat;
  }

  const phase = v0?.phase ?? v1?.phase ?? primary.phase;
  if (phase === "block" || phase === "counter") {
    const battle = (v0?.battle ?? v1?.battle ?? primary.battle) as BattleWire | null | undefined;
    const attacker = battle?.attackerSeat;
    if (attacker === 0 || attacker === 1) {
      const defender: Seat = attacker === 0 ? 1 : 0;
      const defenderView = defender === 0 ? v0 : v1;
      if (seatHasBlockOrCounterIntents(defenderView)) {
        return defender;
      }
      // Race: pending When Attacking / On Opponent's Attack not in either view yet (and pass_block still illegal). Stay on the attacker.
      return attacker;
    }
  }

  if (phase === "mulligan") {
    if (v0 && !v0.you.mulliganDone) return 0;
    if (v1 && !v1.you.mulliganDone) return 1;
    return null;
  }

  const active = v0?.activeSeat ?? v1?.activeSeat ?? primary.activeSeat;
  if (active === 0 || active === 1) {
    return active;
  }

  return null;
}
