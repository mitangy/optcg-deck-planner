import { useEffect } from "react";
import type { Intent, PlayerView } from "../../net/protocol";
import type { DuelSettings } from "../../settings";
import type { BattleLogEntry } from "../match/battleLog";
import { incomingAttackKey, useIncomingAttackCue } from "../combat/attackCue";
import { useCardSpotlights } from "../preview/CardSpotlight";
import { useOpponentReveals } from "../motion/RevealOverlay";
import { gameSfxMuted, useGameSfx } from "./sfx";
import { useSoundCues } from "./soundCues";
import { DEMO_MATCH_ID, isWatchTab, tabMuteCopy, useTabMute } from "./tabMute";
import { audioUnlocked, unlockAudio, useTurnAlert } from "./turnAlert";

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
  hotseatPass: unknown;
  over: boolean;
  autoPass: unknown;
  intents: readonly Intent[];
  previewOppSeat: 0 | 1;
  replay: { quiet: boolean } | undefined;
}) {
  const alertsOn = !spectating && !isReplay && !over && !hotseatPass && autoPass == null;
  // An attack against you has its own cue, so the generic "your move" alert stays quiet while you answer one.
  const attackKey = alertsOn ? incomingAttackKey(view, spectating) : null;
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

  // iOS only plays sound after one started inside a gesture: unlock on the first touch of the match.
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
