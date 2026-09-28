/**
 * Last card the mouse hovered on the board — drives the large preview panel on
 * wide layouts, where fitting both playmats makes field cards small.
 */
import { useSyncExternalStore } from "react";
import type { Seat } from "../decks/seatArtPrefs";

export type PreviewCard = { defId: string; ownerSeat?: Seat };

let current: PreviewCard | null = null;
const listeners = new Set<() => void>();

export function setPreviewCard(next: PreviewCard | null): void {
  if (current?.defId === next?.defId && current?.ownerSeat === next?.ownerSeat) return;
  current = next;
  for (const l of listeners) l();
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
