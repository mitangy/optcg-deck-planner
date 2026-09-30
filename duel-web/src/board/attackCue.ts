import { useEffect, useRef } from "react";
import type { PlayerView } from "../net/protocol";
import { battleEndpoints } from "./battleArc";
import { buzz } from "./haptics";
import { playAttackCue } from "./turnAlert";

/**
 * Identifies the attack you are defending against, or null when there is none
 * (no battle, your own attack, or you are only watching). The key survives a
 * Blocker stepping in and the block -> counter step change, so one attack has
 * one key, and it differs for the next attacker or the next turn.
 */
export function incomingAttackKey(view: PlayerView | null, spectating: boolean): string | null {
  if (!view || spectating) return null;
  const ends = battleEndpoints(view);
  if (!ends || !ends.incoming) return null;
  return `${view.turnNumber}:${ends.attackerId}:${ends.redirectedFromId ?? ends.targetId}`;
}

/** True when `next` is a new attack: it differs from the last one and is not "no attack". */
export function attackCueDue(prev: string | null, next: string | null): boolean {
  return next != null && next !== prev;
}

/** Buzz / play the attack cue once when a new attack against you appears. */
export function useIncomingAttackCue(key: string | null, opts: { sound: boolean }): void {
  const prev = useRef<string | null>(null);
  const { sound } = opts;
  useEffect(() => {
    const due = attackCueDue(prev.current, key);
    prev.current = key;
    if (!due) return;
    buzz("attack");
    if (sound) playAttackCue();
  }, [key, sound]);
}
