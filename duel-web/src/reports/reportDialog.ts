import { createStore } from "../lib/createStore";
import type { ReportTarget } from "./reportLogic";

const current = createStore<ReportTarget | null>(null);

export const openReport = (target: ReportTarget): void => current.set(target);
export const closeReport = (): void => current.set(null);
export const useReportTarget = (): ReportTarget | null => current.use();
