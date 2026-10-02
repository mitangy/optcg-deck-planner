import type { ReactNode } from "react";
import "./fieldBar.css";

/**
 * Slim instruction bar for picking cards straight off the board: what to pick
 * and how many, plus the buttons. It is fixed over the bottom of the board
 * column (never over the chosen-from cards' rows) and has a fixed height, so
 * opening it or ticking a card moves nothing.
 */
export function FieldTargetBar({ title, text, caption, label, children }: {
  title: string;
  text: string;
  caption: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="field-bar" role="group" aria-label={label}>
      <div className="field-bar-text">
        <strong className="field-bar-title">{title}</strong>
        <span className="field-bar-prompt">{text}</span>
      </div>
      <div className="field-bar-side">
        <span className="field-bar-count" aria-live="polite">{caption}</span>
        <span className="field-bar-actions">{children}</span>
      </div>
    </div>
  );
}
