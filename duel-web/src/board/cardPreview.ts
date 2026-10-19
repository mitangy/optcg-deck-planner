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
  fieldCost?: number;
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
  /** Set for auto-shown previews ("Opponent played · Turn 5"); hover previews have none. */
  caption?: string;
};

/** An auto preview never replaces a card the mouse hovered this recently. */
export const HOVER_GRACE_MS = 1500;

let lastHoverAt = -Infinity;
let current: PreviewCard | null = null;
/** True while the mouse is over a card that set the preview (what the pop-up shows itself for). */
let hovering = false;
/** Where the hovered card sat when the hover began (viewport px), so the pop-up can step aside from it (#583). */
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
    a.instanceId === b.instanceId &&
    a.caption === b.caption &&
    liveKey(a.live) === liveKey(b.live)
  );
}

function emit() {
  for (const l of listeners) l();
}

/** Whether an auto preview may replace the panel now (no recent hover). */
export function shouldAutoPreview(now: number, lastHover: number): boolean {
  return now - lastHover >= HOVER_GRACE_MS;
}

/** Hover / focus driven preview: also records the hover time. */
export function setPreviewCard(next: PreviewCard | null): void {
  lastHoverAt = Date.now();
  applyPreview(next);
}

/**
 * Mouse-over preview: like `setPreviewCard`, and also marks a card as hovered
 * until `endPreviewHover` (the pointer leaving it). Focus and click use
 * `setPreviewCard`, so only a real hover opens the pop-up. `anchor` is the
 * hovered element: its box is kept (a new hover replaces it) so the pop-up never
 * lands on the card under the pointer (#583).
 */
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

/** The pointer left the card it was hovering. The docked panel keeps showing it. */
export function endPreviewHover(): void {
  if (!hovering) return;
  hovering = false;
  emit();
}

/** Auto preview (opponent's latest play): leaves the hover timestamp alone. */
export function setAutoPreviewCard(next: PreviewCard | null): void {
  applyPreview(next);
}

/**
 * Close the preview (the pop-up's ×). Leaves the hover timestamp alone, and
 * because the current card is gone, hovering the same card again reopens it.
 */
export function clearPreviewCard(): void {
  applyPreview(null);
  hoverAnchor = null;
}

/** The box of the card the pointer last hovered; kept while the pop-up lingers after the pointer leaves. */
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

/** How long the pop-up stays after the pointer leaves a card, so it can cross a gap onto the pop-up. */
export const POPUP_LEAVE_MS = 250;

/**
 * Whether the pop-up is up right now: pinned, or the mouse is on a card that
 * set the preview, on the pop-up itself, or dragging its header. (After the
 * last of those ends it lingers POPUP_LEAVE_MS more.) An auto preview never
 * counts, so "Opponent played ..." does not open it.
 */
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
