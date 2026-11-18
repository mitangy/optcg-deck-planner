import { useEffect, useRef } from "react";
import type { PlayerView } from "../../net/protocol";
import { battleEndpoints } from "./battleArc";
import { buzz } from "../audio/haptics";
import { playAttackCue } from "../audio/turnAlert";

export function incomingAttackKey(view: PlayerView | null, spectating: boolean): string | null {
  if (!view || spectating) return null;
  const ends = battleEndpoints(view);
  if (!ends || !ends.incoming) return null;
  return `${view.turnNumber}:${ends.attackerId}:${ends.redirectedFromId ?? ends.targetId}`;
}

export function attackCueDue(prev: string | null, next: string | null): boolean {
  return next != null && next !== prev;
}

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
