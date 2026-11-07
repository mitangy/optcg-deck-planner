import { useEffect } from "react";
import type { Intent, PlayerView } from "../net/protocol";
import type { DuelSettings } from "../settings";
import type { BattleLogEntry } from "./battleLog";
import { incomingAttackKey, useIncomingAttackCue } from "./attackCue";
import { useCardSpotlights } from "./CardSpotlight";
import { useOpponentReveals } from "./RevealOverlay";
import { gameSfxMuted, useGameSfx } from "./sfx";
import { useSoundCues } from "./soundCues";
import { DEMO_MATCH_ID, isWatchTab, tabMuteCopy, useTabMute } from "./tabMute";
import { audioUnlocked, unlockAudio, useTurnAlert } from "./turnAlert";

/**
 * The board's sound and alert cues: turn alert, incoming-attack cue, per-tab mute, opponent reveals, card
 * spotlights, sound cues and game sfx, plus the iOS audio unlock. Call it once per board.
 */
export function useBoardAudio({
  view,
  battleLog,
  prefs,
  matchId,
  spectating,
  isReplay,
  hotseatPass,
  over,
  autoPass,
  intents,
  previewOppSeat,
  replay,
}: {
  view: PlayerView | null;
  battleLog: BattleLogEntry[];
  prefs: DuelSettings;
  matchId: string | null;
  spectating: boolean;
  isReplay: boolean;
  /** Present in hotseat, where the device is handed over by the board itself. */
  hotseatPass: unknown;
  over: boolean;
  /** The pass the response stops are about to send, if any. */
  autoPass: unknown;
  intents: readonly Intent[];
  previewOppSeat: 0 | 1;
  replay: { quiet: boolean } | undefined;
}) {
  // Hotseat hands the device over itself; alerts only matter online.
  const alertsOn = !spectating && !isReplay && !over && !hotseatPass && autoPass == null;
  // An attack against you has its own cue, so the generic "your move" alert
  // stays quiet while you are answering one.
  const attackKey = alertsOn ? incomingAttackKey(view, spectating) : null;
  // Per-tab sound (#934): a watch tab goes quiet while another tab has a live match as a player. Demos play no part.
  const tabMute = useTabMute({
    playing: Boolean(view) && matchId != null && matchId !== DEMO_MATCH_ID && !spectating && !isReplay && !hotseatPass && !over,
    watching: isWatchTab({ spectating, isReplay }),
    autoQuiet: prefs.quietWatchTabs,
  });
  const tabMuteText = tabMuteCopy(tabMute);
  useTurnAlert(alertsOn && intents.length > 0 && attackKey == null, {
    buzz: prefs.turnAlert,
    sound: prefs.turnSound,
  });
  useIncomingAttackCue(attackKey, { sound: prefs.turnSound });
  // Same master Sounds toggle: a tick per opponent card use, a thud per Life lost.
  const reveals = useOpponentReveals(battleLog, previewOppSeat, !spectating && !over);
  const replayQuiet = replay?.quiet === true;
  const spotlights = useCardSpotlights(battleLog, prefs.cardSpotlight && !over && !replayQuiet);
  useSoundCues(view, battleLog, previewOppSeat, {
    enabled: alertsOn,
    sound: prefs.turnSound,
    spectating,
  });
  useGameSfx(view, battleLog, {
    sound: prefs.turnSound,
    muted: gameSfxMuted({ quiet: Boolean(hotseatPass) || autoPass != null || replayQuiet, spectating, spectatorSound: prefs.spectatorSound }),
    spectating,
  });

  // iOS only plays sound after one started inside a gesture: unlock on the
  // first touch of the match so a later cue is allowed to play.
  useEffect(() => {
    if (!prefs.turnSound) return;
    const unlock = () => {
      unlockAudio();
      if (audioUnlocked()) document.removeEventListener("pointerdown", unlock, true);
    };
    document.addEventListener("pointerdown", unlock, true);
    return () => document.removeEventListener("pointerdown", unlock, true);
  }, [prefs.turnSound]);

  return { tabMute, tabMuteText, reveals, spotlights, replayQuiet };
}
