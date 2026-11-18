import { attackSummary, defendVerdict, type DefendModel } from "./defendModel";

// Heads the action area beside the board while you are attacked: what is attacking what, and whether you are already safe.
export function DockHeading({ model }: { model: DefendModel }) {
  const verdict = defendVerdict(model);
  return (
    <div className="dock-heading" role="status">
      <span className="dock-heading-text">{attackSummary(model)}</span>{" "}
      <span className={`dock-heading-verdict${verdict.safe ? " is-safe" : ""}`}>{verdict.text}</span>
    </div>
  );
}
