import { type ReactNode } from "react";

/** Deck names as small chips (one per deck), then an optional note and action. */
export function UsedInCell({
  decks,
  note = "",
  action = null,
  className = "",
}: {
  decks: string[];
  note?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`used-in-cell${className ? ` ${className}` : ""}`}>
      {decks.length > 0 && (
        <ul className="used-in-chips" aria-label="Used in decks">
          {decks.map((name) => (
            <li key={name} className="used-in-chip" title={name}>
              {name}
            </li>
          ))}
        </ul>
      )}
      {note && <span className="used-in-note">{note}</span>}
      {action}
    </div>
  );
}
