import { useEffect, useMemo, useState } from "react";
import type { Intent, PlayerView } from "../../net/protocol";
import { canDragDon, giveDonTargetIdsForAll, type DragPayload } from "../combat/dragIntents";
import { movePile, type DonPiles } from "./donPiles";
import {
  attachTargetIds,
  beginAttach,
  donIdsForTarget,
  donQuickAttach,
  nextDonSelection,
  pruneDonSelection,
  quickAttachCounts,
  resolveAttachIntents,
  type PendingAttach,
} from "./donSelection";

export const EMPTY_IDS = new Set<string>();

export function useDonSelection({
  view,
  intents,
  dndEnabled,
  dragPayload,
  selectedBoardId,
  replaceOpen,
  onSendIntent,
  clearSelection,
}: {
  view: PlayerView | null;
  intents: Intent[];
  dndEnabled: boolean;
  dragPayload: DragPayload | null;
  selectedBoardId: string | null;
  replaceOpen: boolean;
  onSendIntent: (intent: Intent) => void;
  clearSelection: () => void;
}) {
  const [selectedDonIds, setSelectedDonIds] = useState<Set<string>>(new Set());
  const [donPiles, setDonPiles] = useState<DonPiles>({});
  const [pendingAttach, setPendingAttach] = useState<PendingAttach | null>(null);
  const costArea = view?.you.costArea ?? [];

  const turnNumber = view?.turnNumber;
  useEffect(() => {
    setDonPiles({});
  }, [turnNumber]);

  function moveDonToPile(donId: string) {
    const present = costArea.map((t) => t.id);
    const ids = selectedDonIds.has(donId)
      ? [donId, ...Array.from(selectedDonIds).filter((id) => id !== donId)]
      : [donId];
    setDonPiles((prev) => movePile(prev, ids, present));
  }

  const draggableDonIds = useMemo(() => {
    if (!dndEnabled) return EMPTY_IDS;
    const ids = new Set<string>();
    for (const t of costArea) {
      if (canDragDon(intents, t.id)) ids.add(t.id);
    }
    return ids;
  }, [dndEnabled, intents, costArea]);

  const giveDonHighlightIds = useMemo(() => {
    if (dragPayload?.type === "give_don") {
      return new Set(giveDonTargetIdsForAll(intents, dragPayload.donIds));
    }
    if (!dragPayload && selectedDonIds.size > 0) {
      return new Set(attachTargetIds(intents, selectedDonIds));
    }
    return EMPTY_IDS;
  }, [dragPayload, intents, selectedDonIds]);

  useEffect(() => {
    setSelectedDonIds((prev) => pruneDonSelection(prev, draggableDonIds));
  }, [draggableDonIds]);

  useEffect(() => {
    if (!pendingAttach) return;
    const stillLegal =
      pendingAttach.donIds.every((id) => selectedDonIds.has(id)) &&
      beginAttach(intents, selectedDonIds, pendingAttach.targetId) != null;
    if (!stillLegal) setPendingAttach(null);
  }, [pendingAttach, selectedDonIds, intents]);

  function clearDonSelection() {
    setSelectedDonIds(new Set());
    setPendingAttach(null);
  }

  function confirmAttach(pending: PendingAttach | null = pendingAttach) {
    const toSend = resolveAttachIntents(intents, pending);
    clearDonSelection();
    if (toSend.length === 0) return;
    clearSelection();
    for (const intent of toSend) onSendIntent(intent);
  }

  const donSelectActive = selectedDonIds.size > 0 || pendingAttach != null;

  useEffect(() => {
    if (!donSelectActive) return;
    function onPointerDown(e: PointerEvent) {
      const el = e.target instanceof Element ? e.target : null;
      if (
        el?.closest(
          ".don-strip-you, .don-attach-confirm, [data-dnd-drop^='give_don:'], .card-inspect-backdrop",
        )
      ) {
        return;
      }
      clearDonSelection();
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [donSelectActive]);

  const legalDonOrder = useMemo(
    () => costArea.filter((t) => draggableDonIds.has(t.id)).map((t) => t.id),
    [costArea, draggableDonIds],
  );

  function toggleDonSelect(donId: string) {
    setPendingAttach(null);
    setSelectedDonIds((prev) => nextDonSelection(prev, donId, legalDonOrder));
  }

  const quickDonIds =
    dndEnabled &&
    !dragPayload &&
    !donSelectActive &&
    !replaceOpen &&
    selectedBoardId &&
    view &&
    (view.you.leader.id === selectedBoardId ||
      view.you.characters.some((c) => c.id === selectedBoardId))
      ? donIdsForTarget(intents, selectedBoardId)
      : [];
  const quickCounts = quickAttachCounts(quickDonIds.length);

  function quickAttach(count: number) {
    if (selectedBoardId) quickAttachTo(selectedBoardId, count);
  }

  function quickAttachTo(id: string, count: number) {
    const toSend = donQuickAttach(intents, id, count);
    clearSelection();
    for (const intent of toSend) onSendIntent(intent);
  }

  return {
    selectedDonIds,
    setSelectedDonIds,
    donPiles,
    pendingAttach,
    setPendingAttach,
    draggableDonIds,
    giveDonHighlightIds,
    donSelectActive,
    moveDonToPile,
    clearDonSelection,
    confirmAttach,
    toggleDonSelect,
    quickCounts,
    quickAttach,
  };
}
