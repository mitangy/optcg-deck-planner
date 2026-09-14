import type { PlayerView, Seat } from "../net/protocol";

type BattleWire = {
  attackerSeat?: Seat;
};

/**
 * Which seat should hold the device in hotseat so the player who can act
 * sees AbilityPrompt / IntentBar (e.g. OP17 Newgate on opponent's attack).
 *
 * Priority: pending choice → block/counter defender → unfinished mulligan →
 * turn player. Returns null when no automatic handoff is needed.
 */
export function hotseatControlSeat(
  view: PlayerView | null | undefined,
  seat0View?: PlayerView | null,
  seat1View?: PlayerView | null,
): Seat | null {
  if (!view) return null;

  const front = view.pendingChoices?.[0];
  if (front && (front.seat === 0 || front.seat === 1)) {
    return front.seat;
  }

  if (view.phase === "block" || view.phase === "counter") {
    const battle = view.battle as BattleWire | null | undefined;
    const attacker = battle?.attackerSeat;
    if (attacker === 0 || attacker === 1) {
      return attacker === 0 ? 1 : 0;
    }
  }

  if (view.phase === "mulligan") {
    const v0 = seat0View ?? (view.seat === 0 ? view : null);
    const v1 = seat1View ?? (view.seat === 1 ? view : null);
    if (v0 && !v0.you.mulliganDone) return 0;
    if (v1 && !v1.you.mulliganDone) return 1;
    return null;
  }

  if (view.activeSeat === 0 || view.activeSeat === 1) {
    return view.activeSeat;
  }

  return null;
}
