import { useEffect } from "react";
import type { CollectorLine } from "../../api";
import { COLLECTOR_MAX } from "./collectorLines";

/** "★ Extra copy": the star never stands alone, so the words always come with it (#1031, renamed #1165). */
export function CollectorChip({ className = "" }: { className?: string }) {
  return <span className={`collector-chip${className ? ` ${className}` : ""}`}>★ Extra copy</span>;
}

/** The deck page's small "★ +1 extra" chip on a card's line. */
export function CollectorDeckChip({ count }: { count?: number }) {
  if (!count || count <= 0) return null;
  return (
    <span className="collector-chip collector-chip-sm" title="Extra copies you want on top of this deck's cards">
      ★ +{count} extra
    </span>
  );
}

/**
 * Want stepper for a collector line. The minus stops at 1: removing the line is a separate,
 * undoable action, so one slip on a phone cannot delete it.
 */
export function CollectorStepper({
  line,
  busy,
  onChange,
}: {
  line: Pick<CollectorLine, "label" | "want">;
  busy: boolean;
  onChange: (qty: number) => void;
}) {
  return (
    <span className="owned-wrap collector-step">
      <button
        type="button"
        className="owned-btn"
        aria-label={`Want one fewer ${line.label} collector copy`}
        disabled={busy || line.want <= 1}
        onClick={() => onChange(line.want - 1)}
      >
        −
      </button>
      <span className="collector-qty" aria-label={`${line.label} collector copies wanted`}>
        {line.want}
      </span>
      <button
        type="button"
        className="owned-btn"
        aria-label={`Want one more ${line.label} collector copy`}
        disabled={busy || line.want >= COLLECTOR_MAX}
        onClick={() => onChange(line.want + 1)}
      >
        +
      </button>
    </span>
  );
}

export function CollectorRemove({
  line,
  cardId,
  disabled,
  onRemove,
}: {
  line: Pick<CollectorLine, "label">;
  cardId: string;
  disabled: boolean;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      className="ghost danger collector-remove"
      aria-label={`Remove ${line.label} collector copy of ${cardId}`}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onRemove();
      }}
    >
      Remove
    </button>
  );
}

/** Fixed bottom toast with one action (Undo). It overlays the page, so it never shifts layout, and hides itself. */
export function UndoToast({
  message,
  actionLabel = "Undo",
  onAction,
  onDismiss,
  ms = 6000,
}: {
  message: string;
  actionLabel?: string;
  onAction: () => void;
  onDismiss: () => void;
  ms?: number;
}) {
  useEffect(() => {
    const t = window.setTimeout(onDismiss, ms);
    return () => window.clearTimeout(t);
  }, [message, ms, onDismiss]);
  return (
    <div className="undo-toast" role="status" aria-live="polite">
      <span className="undo-toast-msg">{message}</span>
      <button type="button" className="undo-toast-action" onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  );
}
