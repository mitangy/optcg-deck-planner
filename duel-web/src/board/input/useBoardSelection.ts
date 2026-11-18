import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { Intent, PlayerView } from "../../net/protocol";
import { cantAttackReason } from "../combat/attackBlock";
import { useAttackAttempt } from "../combat/useAttackAttempt";
import type { AttackWarn } from "../combat/AttackWarning";
import {
  canDragAttacker,
  canDropPlayOnField,
  findDropTargetAtPoint,
  playCardTrashTargetIds,
  playNeedsReplace,
  isReplacePlay,
  resolveDropIntents,
  type DragPayload,
} from "../combat/dragIntents";
import type { useDefendFlow } from "../combat/useDefendFlow";
import { buzz } from "../audio/haptics";
import { blockIntentFor, counterIntentForHand, soleCardButton, splitCardActions } from "./cardActions";
import { beginAttach, donIdsForTarget, quickAttachCounts, type PendingAttach } from "../don/donSelection";
import { EMPTY_IDS } from "../don/useDonSelection";
import {
  attackTargetIdsForAttacker,
  findAttackIntent,
  filterIntentsForSelection,
  hasBoardActions,
} from "../prompts/intentFilter";
import { splitPrimaryIntent } from "../prompts/primaryIntent";
import type { DuelSettings } from "../../settings";

export type BoardSelectionInput = {
  view: PlayerView | null;
  intents: Intent[];
  prefs: DuelSettings;
  spectating: boolean;
  dndEnabled: boolean;
  dragPayload: DragPayload | null;
  setDragPayload: (payload: DragPayload | null) => void;
  handFilter: number | null;
  setHandFilter: Dispatch<SetStateAction<number | null>>;
  selectedBoardId: string | null;
  setSelectedBoardId: Dispatch<SetStateAction<string | null>>;
  counterDefenderId: string | null;
  replaceOpen: boolean;
  openReplace: (handIndex: number) => void;
  defend: ReturnType<typeof useDefendFlow>["defend"];
  defendPrimary: ReturnType<typeof useDefendFlow>["defendPrimary"];
  trayHere: boolean;
  setStagedCounterIds: ReturnType<typeof useDefendFlow>["setStagedCounterIds"];
  setStagedBlockerId: ReturnType<typeof useDefendFlow>["setStagedBlockerId"];
  setQueuedCounter: ReturnType<typeof useDefendFlow>["setQueuedCounter"];
  donSelectActive: boolean;
  selectedDonIds: ReadonlySet<string>;
  setPendingAttach: (pending: PendingAttach | null) => void;
  confirmAttach: (pending?: PendingAttach) => void;
  clearDonSelection: () => void;
  onSendIntent: (intent: Intent) => void;
};

// Drag-drop commits, tap selection of hand/board cards, the attack-aim targets and the can't-attack warning.
export function useBoardSelection({
  view,
  intents,
  prefs,
  spectating,
  dndEnabled,
  dragPayload,
  setDragPayload,
  handFilter,
  setHandFilter,
  selectedBoardId,
  setSelectedBoardId,
  counterDefenderId,
  replaceOpen,
  openReplace,
  defend,
  defendPrimary,
  trayHere,
  setStagedCounterIds,
  setStagedBlockerId,
  setQueuedCounter,
  donSelectActive,
  selectedDonIds,
  setPendingAttach,
  confirmAttach,
  clearDonSelection,
  onSendIntent,
}: BoardSelectionInput) {
  const playFieldHighlight = Boolean(
    dragPayload?.type === "play_card" &&
      (canDropPlayOnField(intents, dragPayload.handIndex) ||
        playNeedsReplace(intents, dragPayload.handIndex)),
  );

  const playTrashHighlightIds = useMemo(() => {
    if (dragPayload?.type !== "play_card") return EMPTY_IDS;
    return new Set(playCardTrashTargetIds(intents, dragPayload.handIndex));
  }, [dragPayload, intents]);

  const actionableBoardIds = useMemo(() => {
    if (!view) return EMPTY_IDS;
    const ids = new Set<string>();
    const candidates = [
      view.you.leader.id,
      ...view.you.characters.map((c) => c.id),
      ...(view.you.stage ? [view.you.stage.id] : []),
    ];
    for (const id of candidates) {
      if (hasBoardActions(intents, id)) ids.add(id);
    }
    return ids;
  }, [view, intents]);

  const draggableAttackerIds = useMemo(() => {
    if (!dndEnabled || !view) return EMPTY_IDS;
    const ids = new Set<string>();
    for (const id of [view.you.leader.id, ...view.you.characters.map((c) => c.id)]) {
      if (canDragAttacker(intents, id)) ids.add(id);
    }
    return ids;
  }, [dndEnabled, view, intents]);

  const attackReadyIds = prefs.attackGlow ? draggableAttackerIds : EMPTY_IDS;

  const attackerId = dragPayload?.type === "attack" ? dragPayload.attackerId : selectedBoardId;
  const attackTargetIds = useMemo(() => {
    if (!dndEnabled || !attackerId || !view) return EMPTY_IDS;
    return new Set(attackTargetIdsForAttacker(intents, attackerId, view.opponent.leader.id));
  }, [dndEnabled, attackerId, intents, view]);

  function commitDrop(payload: DragPayload, clientX: number, clientY: number) {
    const drop = findDropTargetAtPoint(clientX, clientY);
    const toSend = resolveDropIntents(payload, drop, intents, {
      opponentLeaderId: view?.opponent.leader.id,
      defenderId: counterDefenderId,
    });
    setDragPayload(null);
    if (
      toSend.length === 0 &&
      payload.type === "play_card" &&
      drop?.kind !== "play_trash" &&
      playNeedsReplace(intents, payload.handIndex)
    ) {
      openReplace(payload.handIndex);
      return;
    }
    if (toSend.length > 0) {
      buzz("drop");
      setHandFilter(null);
      setSelectedBoardId(null);
      if (payload.type === "counter") {
        const cardId = view?.you.hand[payload.handIndex]?.id;
        setStagedCounterIds((cur) => cur.filter((id) => id !== cardId));
        if (cardId && toSend[0]?.type === "pass_block") {
          setStagedBlockerId(null);
          setQueuedCounter({ cardId, mode: "send" });
        }
      }
      for (const intent of toSend) onSendIntent(intent);
      if (payload.type === "give_don") clearDonSelection();
    }
  }

  function popoverIntentsFor(selection: { handIndex: number | null; boardId: string | null }, dropGiveDonTo?: string): Intent[] {
    if (!view || spectating || defendPrimary) return [];
    const front = view.pendingChoices?.[0];
    const base = front
      ? view.legalIntents.filter((i) => i.type !== "resolve_pending_choice" && i.type !== "order_pending_effects")
      : dropGiveDonTo
        ? view.legalIntents.filter((i) => !(i.type === "give_don" && i.targetId === dropGiveDonTo))
        : view.legalIntents;
    return splitCardActions(filterIntentsForSelection(splitPrimaryIntent(base).rest, selection)).card;
  }

  function pressCardAction(intent: Intent) {
    if (isReplacePlay(intent)) {
      openReplace(intent.handIndex);
      return;
    }
    setHandFilter(null);
    setSelectedBoardId(null);
    onSendIntent(intent);
  }

  function selectHandCard(idx: number) {
    if (prefs.oneTapActions && !trayHere && defend?.phase === "counter") {
      const counter = counterIntentForHand(intents, idx);
      if (counter) {
        setHandFilter(null);
        setSelectedBoardId(null);
        onSendIntent(counter);
        return;
      }
    }
    if (prefs.oneTapActions && handFilter !== idx && !dragPayload && !replaceOpen && !donSelectActive) {
      const sole = soleCardButton(popoverIntentsFor({ handIndex: idx, boardId: null }), []);
      if (sole?.kind === "action") {
        pressCardAction(sole.action);
        return;
      }
    }
    setSelectedBoardId(null);
    setHandFilter((prev) => (prev === idx ? null : idx));
  }

  function selectBoardCard(id: string) {
    if (selectedDonIds.size > 0) {
      const pending = beginAttach(intents, selectedDonIds, id);
      if (pending) {
        if (prefs.oneTapActions) confirmAttach(pending);
        else setPendingAttach(pending);
        return;
      }
      clearDonSelection();
    }
    if (prefs.oneTapActions && !trayHere && defend?.phase === "block") {
      const block = blockIntentFor(intents, id);
      if (block) {
        setHandFilter(null);
        setSelectedBoardId(null);
        onSendIntent(block);
        return;
      }
    }
    if (prefs.oneTapActions && view && selectedBoardId !== id && !dragPayload && !replaceOpen && !donSelectActive) {
      const quickRow =
        dndEnabled && (view.you.leader.id === id || view.you.characters.some((c) => c.id === id))
          ? quickAttachCounts(donIdsForTarget(intents, id).length)
          : [];
      const sole = soleCardButton(
        popoverIntentsFor({ handIndex: null, boardId: id }, quickRow.length > 0 ? id : undefined),
        quickRow,
      );
      if (sole) {
        pressCardAction(sole.action);
        return;
      }
    }
    setHandFilter(null);
    setSelectedBoardId((prev) => (prev === id ? null : id));
  }

  useEffect(() => {
    if (!selectedBoardId || !view) return;
    const stillOnBoard =
      view.you.leader.id === selectedBoardId ||
      view.you.characters.some((c) => c.id === selectedBoardId) ||
      view.you.stage?.id === selectedBoardId;
    if (!stillOnBoard) setSelectedBoardId(null);
  }, [selectedBoardId, view, setSelectedBoardId]);

  const [attackWarn, setAttackWarn] = useState<AttackWarn | null>(null);
  useAttackAttempt({
    enabled: dndEnabled,
    selectedId: selectedBoardId,
    reasonFor: (id) => {
      if (!view) return null;
      const card =
        view.you.leader.id === id ? view.you.leader : view.you.characters.find((c) => c.id === id);
      if (!card) return null;
      return cantAttackReason(card, {
        phase: view.phase,
        busy: Boolean(view.battle) || Boolean(view.pendingChoices?.length),
        turnsStarted: view.you.turnsStarted,
        intents,
      });
    },
    onAttempt: (a) => setAttackWarn({ ...a, nonce: Date.now() }),
  });

  function selectAttackTarget(targetId: string) {
    if (!view || !selectedBoardId) return;
    const intent = findAttackIntent(intents, selectedBoardId, targetId, view.opponent.leader.id);
    if (intent) {
      setSelectedBoardId(null);
      onSendIntent(intent);
    }
  }
  return {
    playFieldHighlight,
    playTrashHighlightIds,
    actionableBoardIds,
    draggableAttackerIds,
    attackReadyIds,
    attackTargetIds,
    commitDrop,
    pressCardAction,
    selectHandCard,
    selectBoardCard,
    attackWarn,
    selectAttackTarget,
  };
}
