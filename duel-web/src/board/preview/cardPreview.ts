import { useSyncExternalStore } from "react";
import type { Seat } from "../../decks/seatArtPrefs";

export type PreviewLive = {
  power?: number;
  printedPower?: number | null;
  fieldCost?: number;
  attachedDonCount?: number;
  rested?: boolean;
  statusLabels?: string[];
};

export type PreviewCard = {
  defId: string;
  ownerSeat?: Seat;
  artCopy?: number;
  instanceId?: string;
  live?: PreviewLive;
  caption?: string;
};

export const HOVER_GRACE_MS = 1500;

let lastHoverAt = -Infinity;
let current: PreviewCard | null = null;
let hovering = false;
// So the pop-up can step aside from the hovered card.
export type HoverAnchor = { left: number; top: number; right: number; bottom: number };
let hoverAnchor: HoverAnchor | null = null;
const listeners = new Set<() => void>();

function liveKey(live: PreviewLive | undefined): string {
  if (!live) return "";
  return [
    live.power ?? "",
    live.printedPower ?? "",
    live.fieldCost ?? "",
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
    a.artCopy === b.artCopy &&
    a.instanceId === b.instanceId &&
    a.caption === b.caption &&
    liveKey(a.live) === liveKey(b.live)
  );
}

function emit() {
  for (const l of listeners) l();
}

export function shouldAutoPreview(now: number, lastHover: number): boolean {
  return now - lastHover >= HOVER_GRACE_MS;
}

export function setPreviewCard(next: PreviewCard | null): void {
  lastHoverAt = Date.now();
  applyPreview(next);
}

// The anchor box is kept so the pop-up never lands on the card under the pointer.
export function hoverPreviewCard(next: PreviewCard | null, anchor?: Element | null): void {
  if (anchor) {
    const r = anchor.getBoundingClientRect();
    hoverAnchor = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  } else {
    hoverAnchor = null;
  }
  setPreviewCard(next);
  if (!hovering) {
    hovering = true;
    emit();
  }
}

export function endPreviewHover(): void {
  if (!hovering) return;
  hovering = false;
  emit();
}

export function setAutoPreviewCard(next: PreviewCard | null): void {
  applyPreview(next);
}

// The hover timestamp is left alone, so hovering the same card again reopens it.
export function clearPreviewCard(): void {
  applyPreview(null);
  hoverAnchor = null;
}

export function getHoverAnchor(): HoverAnchor | null {
  return hoverAnchor;
}

export function getLastHoverAt(): number {
  return lastHoverAt;
}

function applyPreview(next: PreviewCard | null): void {
  if (sameCard(current, next)) return;
  current = next;
  emit();
}

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

// So the pointer can cross a gap onto the pop-up.
export const POPUP_LEAVE_MS = 250;

// An auto preview never counts, so "Opponent played ..." does not open it.
export function previewPopupLive(s: { pinned: boolean; hovering: boolean; overPopup: boolean; dragging: boolean }): boolean {
  return s.pinned || s.hovering || s.overPopup || s.dragging;
}

export function getPreviewHovering(): boolean {
  return hovering;
}

export function usePreviewHovering(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => hovering,
    () => hovering,
  );
}

export function usePreviewCard(): PreviewCard | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  );
}
