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
          A short Log Pose read of your deck against your opponent&apos;s Leader, shown as a card you can
          close, with a Brief button to bring it back. Never shown in ranked games.
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
          Off: the card offers a Get brief button, and a brief someone already wrote shows right away. On:
          Log Pose writes one as soon as the game starts, and it counts toward your Log Pose daily limit.
        </p>
      </div>
    </>
  );
}
