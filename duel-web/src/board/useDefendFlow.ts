import { useEffect, useRef, useState } from "react";
import type { Intent, PlayerView } from "../net/protocol";
import { followUpCounter } from "./counterSkipBlock";
import { deriveDefend } from "./defendModel";
import { counterPrimaryLabel } from "./cardActions";
import { resolveStagedCounters } from "./defendTrayModel";
import { responseStopPass, scheduleAutoPass } from "./gameplayPrefs";
import type { ResponseStops } from "../settings";

/**
 * Answering an attack: the response-stop auto pass, the staged blocker / Counters of the defend tray, and the
 * Counter dropped in the block step that follows the skipped block.
 *
 * The three effects below run in this order on purpose: the step reset first, then the queued Counter, which
 * stages its card after the reset has cleared the tray.
 */
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
  // Response stops: pass for you when the setting says there is nothing to decide.
  const counterOutlook =
    stopMode === "smart" && view && intents.some((i) => i.type === "pass_counter")
      ? (() => {
          const d = deriveDefend(view, intents, { counterIds: [], blockerId: null });
          return d ? { gap: d.gap, values: d.counters.map((c) => c.value) } : undefined;
        })()
      : undefined;
  /**
   * A Counter dropped (or tapped) in the block step: the block is passed, and
   * this card is played (`send`) or staged (`stage`) once the counter step is up.
   */
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
  /** The player answered this step by hand: the automatic pass waiting out its beat must not follow it out. */
  function noteAnswered(_intent: Intent) {
    if (autoPassKeyRef.current) autoPassSent.current = autoPassKeyRef.current;
  }
  useEffect(() => {
    if (!autoPassKey || autoPassSent.current === autoPassKey) return;
    // A beat so the attack registers; against a person a human-length wait, so
    // an instant pass does not reveal there was no usable Counter (#369). You can
    // still answer by hand meanwhile: that marks the step answered (noteAnswered), so this stays quiet.
    return scheduleAutoPass(() => {
      const { intent, send } = autoPassRef.current;
      if (!intent || autoPassSent.current === autoPassKey) return;
      autoPassSent.current = autoPassKey;
      send(intent);
    }, vsHuman);
  }, [autoPassKey, vsHuman]);

  // Defend tray: while you answer an attack, the block / counter choices live
  // in one tray (portrait: in place of the hand, landscape phone: right column).
  const [stagedCounterIds, setStagedCounterIds] = useState<string[]>([]);
  const [stagedBlockerId, setStagedBlockerId] = useState<string | null>(null);
  const defend =
    view && !spectating && !over && !view.pendingChoices?.length && autoPass == null
      ? deriveDefend(view, intents, { counterIds: stagedCounterIds, blockerId: stagedBlockerId })
      : null;
  const trayHere = defend != null && (!wide || lp);
  // Desktop: the same tray sits in the right rail (one tap plays a counter or
  // blocks) so each card's value and what you still need are in view; the
  // dock keeps the Pass block / Pass counter / Resolve button.
  const railDefend = defend != null && wide && !lp;
  const defendKey =
    trayHere && view ? `${view.turnNumber}:${defend.phase}:${JSON.stringify(view.battle ?? null)}` : null;
  useEffect(() => {
    // A new attack / step (or the tray closing) starts from a clean slate.
    setStagedCounterIds([]);
    setStagedBlockerId(null);
  }, [defendKey]);
  // After the step reset above: the block has passed, so play or stage the
  // queued Counter if the counter step takes it.
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

  /** Block step: skip the block, then play (or stage) this Counter in the counter step. */
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
    // Sequential client-side intents, highest hand slot first (see resolveStagedCounters).
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
