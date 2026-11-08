import { createStore } from "../lib/createStore";
import type { ReportTarget } from "./reportLogic";

/**
 * Which player report is open, if any. Same idea as feedbackDialog.ts: the match menu, the post-match card,
 * the friends list and the history pages open the one dialog <ReportHost> renders at the app root.
 */
const current = createStore<ReportTarget | null>(null);

export const openReport = (target: ReportTarget): void => current.set(target);
export const closeReport = (): void => current.set(null);
export const useReportTarget = (): ReportTarget | null => current.use();
