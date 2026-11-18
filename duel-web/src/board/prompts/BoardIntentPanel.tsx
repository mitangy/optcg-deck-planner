import { cloneElement, isValidElement, type ReactNode } from "react";
import type { Intent, PlayerView, Seat } from "../../net/protocol";
import type { DuelSettings } from "../../settings";
import type { useDefendFlow } from "../combat/useDefendFlow";
import type { describeMatchResult } from "../match/matchResult";
import { endTurnWarning } from "../settings/gameplayPrefs";
import { IntentBar } from "./IntentBar";

export type BoardIntentPanelProps = {
  view: PlayerView;
  prefs: DuelSettings;
  mySeat: Seat | null;
  railDefend: boolean;
  defendTray: ReactNode;
  wide: boolean;
  lp: boolean;
  spectating: boolean;
  isReplay: boolean;
  over: boolean;
  nearHand: unknown;
  oppWait: React.ComponentProps<typeof IntentBar>["waiting"];
  barIntents: Intent[];
  handFilter: number | null;
  selectedBoardId: string | null;
  defendPrimary: ReturnType<typeof useDefendFlow>["defendPrimary"];
  counterLabel: ReturnType<typeof useDefendFlow>["counterLabel"];
  cardIntentCount: number;
  popoverOpen: boolean;
  decidingMulligan: boolean;
  sendPrimary: (intent: Intent) => void;
  openReplace: (handIndex: number) => void;
  replay: { controls: ReactNode; quiet: boolean } | undefined;
  resultHidden: boolean;
  setResultHidden: (hidden: boolean) => void;
  result: ReturnType<typeof describeMatchResult>;
};

// The action bar under the hand (or the Defend tray / replay controls in its place).
export function BoardIntentPanel({
  view,
  prefs,
  mySeat,
  railDefend,
  defendTray,
  wide,
  lp,
  spectating,
  isReplay,
  over,
  nearHand,
  oppWait,
  barIntents,
  handFilter,
  selectedBoardId,
  defendPrimary,
  counterLabel,
  cardIntentCount,
  popoverOpen,
  decidingMulligan,
  sendPrimary,
  openReplace,
  replay,
  resultHidden,
  setResultHidden,
  result,
}: BoardIntentPanelProps) {
  const replayBar = replay ? (
    <div className="intent-bar replay-bar">
      {isValidElement(replay.controls)
        ? cloneElement(replay.controls as React.ReactElement<{ resultSlot?: ReactNode }>, {
            resultSlot:
              over && resultHidden ? (
                <>
                  <span className={`match-result-inline-text match-result-${result.outcome}`}>{result.headline}</span>
                  <button type="button" className="replay-result-btn" onClick={() => setResultHidden(false)}>
                    Show result
                  </button>
                </>
              ) : null,
          })
        : replay.controls}
    </div>
  ) : null;
  const panel = railDefend && defendTray ? (
    defendTray
  ) : (wide && !lp) || decidingMulligan ? null : !spectating ? (
    <>
    <IntentBar
      waiting={oppWait}
      idle={oppWait ? "opponent" : view.pendingChoices?.[0]?.seat === mySeat ? "prompt" : null}
      intents={barIntents}
      view={view}
      disabled={over}
      filterHandIndex={handFilter}
      selectedBoardId={selectedBoardId}
      confirmEndTurn={endTurnWarning(isReplay ? "never" : prefs.endTurnConfirm, view.legalIntents)}
      onSend={sendPrimary}
      onChooseReplace={openReplace}
      defend={defendPrimary}
      counterLabel={counterLabel}
      onCard={{ count: cardIntentCount, active: popoverOpen }}
    />
    {replayBar}
    </>
  ) : replayBar ? (
    replayBar
  ) : !wide || lp ? null : (
    <div className="intent-bar">
      <p className="intent-empty">
        {nearHand ? "Spectating — both hands shown; intents disabled" : "Spectating — both hands hidden; intents disabled"}
      </p>
    </div>
  );
  return panel;
}
