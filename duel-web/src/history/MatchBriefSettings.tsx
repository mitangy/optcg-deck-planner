import { useLogPose } from "@optcg/analyst-client";
import { updateSettings, useDuelSettings } from "../settings";

/**
 * The Log Pose matchup brief settings: shown only to players who have Log Pose, and synced to the account
 * like every other setting.
 */
export function MatchBriefSettings() {
  const { enabled } = useLogPose();
  const settings = useDuelSettings();
  if (enabled !== true) return null;
  return (
    <>
      <div className="gameplay-toggle">
        <label className="switch">
          <input
            type="checkbox"
            checked={settings.matchBrief}
            onChange={(e) => updateSettings({ matchBrief: e.target.checked })}
          />
          <span>Matchup brief before casual and practice games</span>
        </label>
        <p className="field-hint">
          A short Log Pose read of the matchup when the game starts. Never in ranked.
        </p>
      </div>
      <div className="gameplay-toggle">
        <label className="switch">
          <input
            type="checkbox"
            checked={settings.matchBriefAuto}
            disabled={!settings.matchBrief}
            onChange={(e) => updateSettings({ matchBriefAuto: e.target.checked })}
          />
          <span>Write briefs automatically</span>
        </label>
        <p className="field-hint">
          Writes the brief as the game starts instead of when you ask. Uses your Log Pose daily limit.
        </p>
      </div>
      <div className="gameplay-toggle">
        <label className="switch">
          <input
            type="checkbox"
            checked={settings.logPoseCopilot}
            onChange={(e) => updateSettings({ logPoseCopilot: e.target.checked })}
          />
          <span>Log Pose in casual and practice games</span>
        </label>
        <p className="field-hint">
          Ask Log Pose about your turn, or let it play one you approve. Never in ranked. Uses your daily limit.
        </p>
      </div>
    </>
  );
}
