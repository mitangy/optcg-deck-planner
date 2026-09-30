import { intentLabel, type Intent, type PlayerView } from "../net/protocol";
import { ConfirmButton } from "./ConfirmButton";
import { collapseReplacePlays, isReplacePlay } from "./dragIntents";
import { filterIntentsForSelection } from "./intentFilter";
import { splitPrimaryIntent } from "./primaryIntent";

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
  /**
   * The defend tray owns the block / counter choices: hide the secondary
   * actions and let the tray relabel the primary ("Take hit", "Confirm
   * counter"). `onPress` replaces sending the primary intent itself.
   */
  defend?: { label: string; onPress?: () => void };
};

function btnClass(intent: Intent): string {
  if (intent.type === "end_turn") return "intent-btn intent-btn-end";
  if (intent.type === "pass_counter" || intent.type === "pass_block") {
    return "intent-btn intent-btn-pass";
  }
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
  defend,
}: Props) {
  const handIndex = filterHandIndex ?? null;
  const boardId = selectedBoardId ?? null;
  // The primary comes from every legal intent, not the selection-filtered
  // list, so its slot never changes when a card is tapped.
  const { primary, rest } = splitPrimaryIntent(intents);
  const shown = defend
    ? []
    : collapseReplacePlays(filterIntentsForSelection(rest, { handIndex, boardId }));
  const mulliganPhase = view?.phase === "mulligan";
  const nothingSelected = handIndex == null && boardId == null;

  if (shown.length === 0 && !primary) {
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
    <div
      className={`intent-bar${mulliganPhase ? " intent-bar-mulligan" : ""}${
        defend ? " intent-bar-defend" : ""
      }`}
    >
      <h2>{mulliganPhase ? "Mulligan" : "Actions"}</h2>
      <div className="intent-layout">
        <div className="intent-row">
          {shown.length === 0 && !defend ? (
            <p className="intent-empty">
              {nothingSelected ? "Select a card for actions" : "No actions for this card"}
            </p>
          ) : null}
          {shown.map((intent, idx) => (
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
          ))}
        </div>
        {primary ? (
          <div className="intent-primary">
            {primary.type === "end_turn" && confirmEndTurn ? (
              <ConfirmButton
                className={`${btnClass(primary)} intent-btn-primary`}
                label={intentLabel(primary, view)}
                confirmLabel="Tap again to end"
                title="Ends your turn after a second tap"
                disabled={disabled}
                reserveWidth
                onConfirm={() => onSend(primary)}
              />
            ) : (
              <button
                type="button"
                className={`${btnClass(primary)} intent-btn-primary`}
                disabled={disabled}
                onClick={() => (defend?.onPress ? defend.onPress() : onSend(primary))}
              >
                {defend ? defend.label : intentLabel(primary, view)}
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
