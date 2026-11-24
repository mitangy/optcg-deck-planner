import type { BriefTicketWire, Intent, PlayerView, Seat } from "../../net/protocol";
import { useLogPose } from "@optcg/analyst-client";
import { useLogPoseCopilot } from "../copilot/LogPoseCopilot";
import { LogPoseMatchButton } from "../copilot/LogPoseMatchButton";
import type { BattleLogEntry } from "./battleLog";
import { useMatchBrief } from "./MatchBrief";
import { matchLogPoseEntry } from "./matchBriefModel";

// The pre-match brief, the in-match copilot and the Log Pose entry button they share.
export function useMatchAssist({
  matchBrief,
  spectating,
  matchId,
  view,
  over,
  lp,
  wide,
  battleLog,
  onSendIntent,
  seat,
  errorBanner,
}: {
  matchBrief: { brief: BriefTicketWire | null; ranked: boolean | null; ticketSeat?: Seat } | undefined;
  spectating: boolean;
  matchId: string | null;
  view: PlayerView | null;
  over: boolean;
  lp: boolean;
  wide: boolean;
  battleLog: BattleLogEntry[];
  onSendIntent: (intent: Intent) => void;
  seat: Seat | null;
  errorBanner: string | null;
}) {
  const brief = useMatchBrief({
    source: matchBrief,
    role: spectating ? "spectator" : "player",
    roomMatchId: matchId,
    phase: view?.phase,
    over,
    layout: lp ? "landscape" : wide ? "desktop" : "portrait",
  });
  const copilot = useLogPoseCopilot({
    source: matchBrief,
    role: spectating ? "spectator" : "player",
    view,
    battleLog,
    onSendIntent,
    over,
    layout: lp ? "landscape" : wide ? "desktop" : "portrait",
    ticketSeat: matchBrief?.ticketSeat ?? seat,
    errorBanner,
  });
  const logPoseEntry = matchLogPoseEntry({ briefShown: brief.shown, copilotShown: copilot.shown });
  const lpAnalyst = useLogPose();
  const logPoseOpen = logPoseEntry === "button" && lpAnalyst.panelOpen;
  const logPoseButton =
    logPoseEntry === "button" ? <LogPoseMatchButton layout={lp ? "landscape" : wide ? "desktop" : "portrait"} over={over} busy={brief.busy || copilot.running} /> : null;
  return { brief, copilot, logPoseEntry, lpAnalyst, logPoseOpen, logPoseButton };
}
