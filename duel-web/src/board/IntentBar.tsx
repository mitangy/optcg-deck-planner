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

export function IntentBar({ intents, view, disabled, filterHandIndex, onSend }: Props) {
  const shown = intents.filter((i) => matchesHandFilter(i, filterHandIndex));

  if (shown.length === 0) {
    return (
      <div className="intent-bar">
        <p className="intent-empty">No legal actions right now</p>
      </div>
    );
  }

  return (
    <div className="intent-bar">
      <h2>Actions</h2>
      <div className="intent-row">
        {shown.map((intent, idx) => (
          <button
            key={`${intent.type}-${idx}`}
            type="button"
            className="intent-btn"
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
