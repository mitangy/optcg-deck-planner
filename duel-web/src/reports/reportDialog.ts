import { useSyncExternalStore } from "react";
import type { ReportTarget } from "./reportLogic";

/**
 * Which player report is open, if any. Same idea as feedbackDialog.ts: the match menu, the post-match card,
 * the friends list and the history pages open the one dialog <ReportHost> renders at the app root.
 */
let current: ReportTarget | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

export function openReport(target: ReportTarget): void {
  current = target;
  emit();
}

export function closeReport(): void {
  current = null;
  emit();
}

export function useReportTarget(): ReportTarget | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => null,
  );
}
