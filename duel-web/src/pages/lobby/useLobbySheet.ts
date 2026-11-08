import { useState } from "react";
import { DEFAULT_BOT_LEVEL, type BotLevel } from "../../home/botGame";
import type { TimerPreset } from "../../home/timerPreset";
import type { PlayMode } from "./modes";

/** The Play sheet: closed, choosing a mode, or configuring one, plus the values its forms hold. */
export function useLobbySheet() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mode, setMode] = useState<PlayMode | null>(null);
  const [timerPreset, setTimerPreset] = useState<TimerPreset>("off");
  const [error, setError] = useState<string | null>(null);
  const [roomId, setRoomId] = useState("");
  /** Play vs Bot: how strong the bot is. */
  const [botLevel, setBotLevel] = useState<BotLevel>(DEFAULT_BOT_LEVEL);
  /** Play vs Bot only: "Your deck" is Random, resolved when the game starts. Not saved as the selected deck. */
  const [yourRandom, setYourRandom] = useState(false);

  function pickMode(next: PlayMode) {
    setError(null);
    setMode(next);
    if (next === "create") setTimerPreset("off");
  }

  /** The sheet at the mode chooser, or straight at one mode. */
  function openSheet(at: PlayMode | null = null) {
    setError(null);
    setMode(null);
    if (at) pickMode(at);
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setMode(null);
    setError(null);
  }

  function backToModes() {
    setError(null);
    setMode(null);
  }

  return {
    sheetOpen,
    setSheetOpen,
    mode,
    setMode,
    timerPreset,
    setTimerPreset,
    error,
    setError,
    roomId,
    setRoomId,
    botLevel,
    setBotLevel,
    yourRandom,
    setYourRandom,
    pickMode,
    openSheet,
    closeSheet,
    backToModes,
  };
}

export type LobbySheet = ReturnType<typeof useLobbySheet>;
