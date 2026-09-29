/**
 * Last card the mouse hovered on the board — drives the large preview panel on
 * wide layouts, where fitting both playmats makes field cards small.
 */
import { useSyncExternalStore } from "react";
import type { Seat } from "../decks/seatArtPrefs";

/** In-play state of the hovered instance (field cards only). */
export type PreviewLive = {
  power?: number;
  printedPower?: number | null;
  attachedDonCount?: number;
  rested?: boolean;
  statusLabels?: string[];
};

export type PreviewCard = {
  defId: string;
  ownerSeat?: Seat;
  /** Field instance id — lets later renders refresh `live` in place. */
  instanceId?: string;
  live?: PreviewLive;
};

let current: PreviewCard | null = null;
const listeners = new Set<() => void>();

function liveKey(live: PreviewLive | undefined): string {
  if (!live) return "";
  return [
    live.power ?? "",
    live.printedPower ?? "",
    live.attachedDonCount ?? "",
    live.rested ? 1 : 0,
    (live.statusLabels ?? []).join("|"),
  ].join(";");
}

function sameCard(a: PreviewCard | null, b: PreviewCard | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.defId === b.defId &&
    a.ownerSeat === b.ownerSeat &&
    a.instanceId === b.instanceId &&
    liveKey(a.live) === liveKey(b.live)
  );
}

function emit() {
  for (const l of listeners) l();
}

export function setPreviewCard(next: PreviewCard | null): void {
  if (sameCard(current, next)) return;
  current = next;
  emit();
}

/**
 * Keep the preview in sync when the hovered field card's power / statuses
 * change (DON attached, counter played, …) without re-hovering.
 */
export function refreshPreviewLive(instanceId: string, live: PreviewLive): void {
  if (!current || current.instanceId !== instanceId) return;
  if (liveKey(current.live) === liveKey(live)) return;
  current = { ...current, live };
  emit();
}

export function getPreviewCard(): PreviewCard | null {
  return current;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function usePreviewCard(): PreviewCard | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  );
}
