import { useEffect, useRef, useState } from "react";
import type { Intent, PlayerView } from "../../net/protocol";
import { followUpCounter } from "./counterSkipBlock";
import { deriveDefend } from "./defendModel";
import { counterPrimaryLabel } from "../input/cardActions";
import { resolveStagedCounters } from "./defendTrayModel";
import { responseStopPass, scheduleAutoPass } from "../settings/gameplayPrefs";
import type { ResponseStops } from "../../settings";

// Effects run in this order on purpose: the step reset first, then the queued Counter, which stages its card after the reset cleared the tray.
export function useDefendFlow({
  view,
  intents,
  stopMode,
  spectating,
  isReplay,
  over,
  vsHuman,
  wide,
  lp,
  onSendIntent,
}: {
  view: PlayerView | null;
  intents: Intent[];
  stopMode: ResponseStops;
  spectating: boolean;
  isReplay: boolean;
  over: boolean;
  vsHuman: boolean;
  wide: boolean;
  lp: boolean;
  onSendIntent: (intent: Intent) => void;
}) {
  const counterOutlook =
    stopMode === "smart" && view && intents.some((i) => i.type === "pass_counter")
      ? (() => {
          const d = deriveDefend(view, intents, { counterIds: [], blockerId: null });
          return d ? { gap: d.gap, values: d.counters.map((c) => c.value) } : undefined;
        })()
      : undefined;
  const [queuedCounter, setQueuedCounter] = useState<{
    cardId: string;
    mode: "send" | "stage";
  } | null>(null);
  const autoPass =
    stopMode !== "always" &&
    view &&
    !spectating &&
    !isReplay &&
    !over &&
    !view.pendingChoices?.length &&
    queuedCounter == null
      ? responseStopPass(stopMode, intents, counterOutlook)
      : null;
  const autoPassKey =
    autoPass && view
      ? `${view.turnNumber}:${autoPass.type}:${JSON.stringify(view.battle ?? null)}`
      : null;
  const autoPassRef = useRef<{ intent: typeof autoPass; send: typeof onSendIntent }>({
    intent: null,
    send: onSendIntent,
  });
  autoPassRef.current = { intent: autoPass, send: onSendIntent };
  const autoPassSent = useRef<string | null>(null);
  const autoPassKeyRef = useRef(autoPassKey);
  autoPassKeyRef.current = autoPassKey;
  function noteAnswered(_intent: Intent) {
    if (autoPassKeyRef.current) autoPassSent.current = autoPassKeyRef.current;
  }
  useEffect(() => {
    if (!autoPassKey || autoPassSent.current === autoPassKey) return;
    // A beat so the attack registers; against a person a human-length wait, so an instant pass does not reveal there was no usable Counter.
    // Answering by hand meanwhile marks the step answered (noteAnswered), so this stays quiet.
    return scheduleAutoPass(() => {
      const { intent, send } = autoPassRef.current;
      if (!intent || autoPassSent.current === autoPassKey) return;
      autoPassSent.current = autoPassKey;
      send(intent);
    }, vsHuman);
  }, [autoPassKey, vsHuman]);

  const [stagedCounterIds, setStagedCounterIds] = useState<string[]>([]);
  const [stagedBlockerId, setStagedBlockerId] = useState<string | null>(null);
  const defend =
    view && !spectating && !over && !view.pendingChoices?.length && autoPass == null
      ? deriveDefend(view, intents, { counterIds: stagedCounterIds, blockerId: stagedBlockerId })
      : null;
  const trayHere = defend != null && (!wide || lp);
  const railDefend = defend != null && wide && !lp;
  const defendKey =
    trayHere && view ? `${view.turnNumber}:${defend.phase}:${JSON.stringify(view.battle ?? null)}` : null;
  useEffect(() => {
    setStagedCounterIds([]);
    setStagedBlockerId(null);
  }, [defendKey]);
  useEffect(() => {
    if (!queuedCounter || !view) return;
    const { settled, intent } = followUpCounter(intents, view.you.hand, queuedCounter.cardId);
    if (!settled) return;
    setQueuedCounter(null);
    if (!intent) return;
    if (queuedCounter.mode === "send") onSendIntent(intent);
    else setStagedCounterIds([queuedCounter.cardId]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queuedCounter, intents, view]);

  function skipBlockToCounter(cardId: string, mode: "send" | "stage") {
    const pass = intents.find((i) => i.type === "pass_block");
    if (!pass) return;
    setStagedBlockerId(null);
    setQueuedCounter({ cardId, mode });
    onSendIntent(pass);
  }

  function confirmCounters() {
    if (!defend || !view) return;
    const toSend = resolveStagedCounters(intents, view.you.hand, defend.stagedIds);
    setStagedCounterIds([]);
    for (const intent of toSend) onSendIntent(intent);
  }

  function declareStagedBlocker() {
    const id = defend?.stagedBlockerId;
    const intent = intents.find((i) => i.type === "declare_block" && i.blockerId === id);
    setStagedBlockerId(null);
    if (intent) onSendIntent(intent);
  }

  const defendPrimary =
    trayHere && defend
      ? defend.phase === "block"
        ? defend.stagedBlockerId
          ? {
              label: `Block with ${defend.blockers.find((b) => b.id === defend.stagedBlockerId)?.name ?? "blocker"}`,
              onPress: declareStagedBlocker,
            }
          : { label: "No block" }
        : defend.stagedIds.length > 0
          ? {
              label: counterPrimaryLabel(defend, true),
              onPress: confirmCounters,
              warn: counterPrimaryLabel(defend, true) !== "Confirm counter",
            }
          : { label: counterPrimaryLabel(defend, true) }
      : undefined;
  const counterLabel =
    !trayHere && defend?.phase === "counter" ? counterPrimaryLabel(defend, false) : undefined;

  return {
    noteAnswered,
    autoPass,
    defend,
    trayHere,
    railDefend,
    defendPrimary,
    counterLabel,
    setStagedCounterIds,
    setStagedBlockerId,
    setQueuedCounter,
    skipBlockToCounter,
  };
}
