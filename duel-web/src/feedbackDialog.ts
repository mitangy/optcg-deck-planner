import { useSyncExternalStore } from "react";

/**
 * Which feedback dialog is open, if any. A tiny store so the match menu, the
 * footer, Settings and the lobby can all open the one dialog <FeedbackHost>
 * renders at the app root, without threading props through the board.
 */
let openTitle: string | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

export function openFeedback(title: string): void {
  openTitle = title;
  emit();
}

export function closeFeedback(): void {
  openTitle = null;
  emit();
}

export function useOpenFeedbackTitle(): string | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => openTitle,
    () => null,
  );
}
