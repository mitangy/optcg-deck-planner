import { ReportPlayerDialog } from "./ReportPlayerDialog";
import { submitReport } from "./reportApi";
import { closeReport, useReportTarget } from "./reportDialog";

export function ReportHost() {
  const target = useReportTarget();
  if (!target) return null;
  return <ReportPlayerDialog key={`${target.source}:${target.matchId ?? ""}`} target={target} submit={(body) => submitReport(body).then(() => undefined)} onClose={closeReport} />;
}
