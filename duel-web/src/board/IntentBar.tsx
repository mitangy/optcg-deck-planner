import { intentLabel, type Intent, type PlayerView } from "../net/protocol";
import { ConfirmButton } from "./ConfirmButton";
import { collapseReplacePlays, isReplacePlay } from "./dragIntents";
import { filterIntentsForSelection } from "./intentFilter";

type Props = {
  intents: Intent[];
  view?: PlayerView;
  disabled?: boolean;
  filterHandIndex?: number | null;
  selectedBoardId?: string | null;
  /** End turn needs a second tap (gameplay setting). */
  confirmEndTurn?: boolean;
  onSend: (intent: Intent) => void;
  /** Full-board play: ask which Character to replace instead of sending. */
  onChooseReplace?: (handIndex: number) => void;
};

function btnClass(intent: Intent): string {
  if (intent.type === "end_turn") return "intent-btn intent-btn-end";
  if (intent.type !== "mulligan") return "intent-btn";
  return intent.doMulligan ? "intent-btn intent-btn-mulligan" : "intent-btn intent-btn-keep";
}

export function IntentBar({
  intents,
  view,
  disabled,
  filterHandIndex,
  selectedBoardId,
  confirmEndTurn = false,
  onSend,
  onChooseReplace,
}: Props) {
  const handIndex = filterHandIndex ?? null;
  const boardId = selectedBoardId ?? null;
  const shown = collapseReplacePlays(filterIntentsForSelection(intents, { handIndex, boardId }));
  const mulliganPhase = view?.phase === "mulligan";
  const nothingSelected = handIndex == null && boardId == null;

  if (shown.length === 0) {
    return (
      <div className="intent-bar">
        <p className="intent-empty">
          {mulliganPhase && view?.you.mulliganDone
            ? "Waiting for opponent to finish mulligan…"
            : nothingSelected && intents.length > 0
              ? "Select a card for actions"
              : "No legal actions right now"}
        </p>
      </div>
    );
  }

  return (
    <div className={`intent-bar${mulliganPhase ? " intent-bar-mulligan" : ""}`}>
      <h2>{mulliganPhase ? "Mulligan" : "Actions"}</h2>
      <div className="intent-row">
        {shown.map((intent, idx) =>
          intent.type === "end_turn" && confirmEndTurn ? (
            <ConfirmButton
              key={`${intent.type}-${idx}`}
              className={btnClass(intent)}
              label={intentLabel(intent, view)}
              confirmLabel="Tap again to end"
              title="Ends your turn after a second tap"
              disabled={disabled}
              reserveWidth
              onConfirm={() => onSend(intent)}
            />
          ) : (
          <button
            key={`${intent.type}-${idx}`}
            type="button"
            className={btnClass(intent)}
            disabled={disabled}
            onClick={() =>
              onChooseReplace && isReplacePlay(intent)
                ? onChooseReplace(intent.handIndex as number)
                : onSend(intent)
            }
          >
            {onChooseReplace && isReplacePlay(intent)
              ? `${intentLabel({ type: "play_card", handIndex: intent.handIndex }, view)} (choose replacement)`
              : intentLabel(intent, view)}
          </button>
          ),
        )}
      </div>
    </div>
  );
}
