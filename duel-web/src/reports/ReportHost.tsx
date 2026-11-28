import { lazy, Suspense } from "react";
import { submitReport } from "./reportApi";
import { closeReport, useReportTarget } from "./reportDialog";

const ReportPlayerDialog = lazy(() => import("./ReportPlayerDialog").then((m) => ({ default: m.ReportPlayerDialog })));

export function ReportHost() {
  const target = useReportTarget();
  if (!target) return null;
  return (
    <Suspense fallback={null}>
      <ReportPlayerDialog key={`${target.source}:${target.matchId ?? ""}`} target={target} submit={(body) => submitReport(body).then(() => undefined)} onClose={closeReport} />
    </Suspense>
  );
}
