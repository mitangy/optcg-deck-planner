import { useEffect, useRef } from "react";
import type { PlayerView } from "../net/protocol";
import type { BattleLogEntry } from "./battleLog";
import { motionCues, type MotionCue } from "./motionCues";
import { latestOpponentPlay } from "./opponentPlay";
import { playLifeLostCue, playOpponentPlayCue, playOppLifeLostCue } from "./turnAlert";

/**
 * Whether the newest opponent play is a new one worth a cue. `prevId` is the
 * play seen last time: undefined before the first look (mount: never a cue),
 * null when there was none. A play id that disappeared from the log means the
 * log was replaced (resync / undo), which is not a new play either.
 */
export function opponentPlayCueDue(
  prevId: string | null | undefined,
  nextId: string | null,
  entries: readonly BattleLogEntry[],
): boolean {
  if (prevId === undefined || nextId == null || nextId === prevId) return false;
  if (prevId !== null && !entries.some((e) => e.id === prevId)) return false;
  return true;
}

/**
 * Which damage cue a view change earns. Your own Life loss wins over the
 * opponent's when both happen at once; spectators have no "you", so they only
 * ever get the soft one.
 */
export function lifeDamageCue(
  cues: readonly MotionCue[],
  spectating: boolean,
): "you" | "opp" | null {
  const lost = (side: "you" | "opp") => cues.some((c) => c.kind === "life_lost" && c.side === side);
  if (!spectating && lost("you")) return "you";
  return lost("opp") ? "opp" : null;
}

/**
 * Play a short cue once per new opponent card use and once per Life loss.
 * `enabled` = alerts apply (not spectating / match over); `sound` = the master
 * Sounds setting. State is tracked even while muted so unmuting never replays.
 */
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
