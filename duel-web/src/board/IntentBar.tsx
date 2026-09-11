import { intentLabel, type Intent, type PlayerView } from "../net/protocol";

type Props = {
  intents: Intent[];
  view?: PlayerView;
  disabled?: boolean;
  filterHandIndex?: number | null;
  onSend: (intent: Intent) => void;
};

function matchesHandFilter(intent: Intent, handIndex: number | null | undefined): boolean {
  if (handIndex == null) return true;
  if (typeof intent.handIndex === "number") return intent.handIndex === handIndex;
  return true;
}

function btnClass(intent: Intent): string {
  if (intent.type !== "mulligan") return "intent-btn";
  return intent.doMulligan ? "intent-btn intent-btn-mulligan" : "intent-btn intent-btn-keep";
}

export function IntentBar({ intents, view, disabled, filterHandIndex, onSend }: Props) {
  const shown = intents.filter((i) => matchesHandFilter(i, filterHandIndex));
  const mulliganPhase = view?.phase === "mulligan";

  if (shown.length === 0) {
    return (
      <div className="intent-bar">
        <p className="intent-empty">
          {mulliganPhase && view?.you.mulliganDone
            ? "Waiting for opponent to finish mulligan…"
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
