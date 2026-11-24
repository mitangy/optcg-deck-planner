import { useEffect, useRef } from "react";
import type { PlayerView } from "../../net/protocol";
import type { BattleLogEntry } from "../match/battleLog";
import { motionCues, type MotionCue } from "../motion/motionCues";
import { latestOpponentPlay } from "../motion/opponentPlay";
import { playLifeLostCue, playOpponentPlayCue, playOppLifeLostCue } from "./turnAlert";

// A play id gone from the log means the log was replaced (resync / undo), not a new play.
export function opponentPlayCueDue(
  prevId: string | null | undefined,
  nextId: string | null,
  entries: readonly BattleLogEntry[],
): boolean {
  if (prevId === undefined || nextId == null || nextId === prevId) return false;
  if (prevId !== null && !entries.some((e) => e.id === prevId)) return false;
  return true;
}

export function lifeDamageCue(
  cues: readonly MotionCue[],
  spectating: boolean,
): "you" | "opp" | null {
  const lost = (side: "you" | "opp") => cues.some((c) => c.kind === "life_lost" && c.side === side);
  if (!spectating && lost("you")) return "you";
  return lost("opp") ? "opp" : null;
}

export function useSoundCues(
  view: PlayerView | null,
  battleLog: readonly BattleLogEntry[],
  oppSeat: 0 | 1,
  opts: { enabled: boolean; sound: boolean; spectating: boolean },
): void {
  const { enabled, sound, spectating } = opts;
  const prevView = useRef<PlayerView | null>(null);
  useEffect(() => {
    const prev = prevView.current;
    prevView.current = view;
    if (!view || !enabled || !sound) return;
    const cue = lifeDamageCue(motionCues(prev, view), spectating);
    if (cue === "you") playLifeLostCue();
    else if (cue === "opp") playOppLifeLostCue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const playId = latestOpponentPlay(battleLog, oppSeat)?.entryId ?? null;
  const prevPlayId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const prev = prevPlayId.current;
    prevPlayId.current = playId;
    if (enabled && sound && opponentPlayCueDue(prev, playId, battleLog)) playOpponentPlayCue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playId]);
}
