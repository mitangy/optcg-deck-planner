import { intentLabel, type Intent, type PlayerView } from "../net/protocol";
import { filterIntentsForSelection } from "./intentFilter";

type Props = {
  intents: Intent[];
  view?: PlayerView;
  disabled?: boolean;
  filterHandIndex?: number | null;
  selectedBoardId?: string | null;
  onSend: (intent: Intent) => void;
};

function btnClass(intent: Intent): string {
  if (intent.type !== "mulligan") return "intent-btn";
  return intent.doMulligan ? "intent-btn intent-btn-mulligan" : "intent-btn intent-btn-keep";
}

export function IntentBar({
  intents,
  view,
  disabled,
  filterHandIndex,
  selectedBoardId,
  onSend,
}: Props) {
  const handIndex = filterHandIndex ?? null;
  const boardId = selectedBoardId ?? null;
  const shown = filterIntentsForSelection(intents, { handIndex, boardId });
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
        {shown.map((intent, idx) => (
          <button
            key={`${intent.type}-${idx}`}
            type="button"
            className={btnClass(intent)}
            disabled={disabled}
            onClick={() => onSend(intent)}
          >
            {intentLabel(intent, view)}
          </button>
        ))}
      </div>
    </div>
  );
}
