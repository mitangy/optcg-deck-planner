import { useEffect, useState } from "react";

type Props = {
  className?: string;
  label: string;
  /** Shown after the first click; a second click within `armMs` confirms. */
  confirmLabel: string;
  title?: string;
  /** Overrides the accessible name (icon-only labels). */
  ariaLabel?: string;
  disabled?: boolean;
  armMs?: number;
  /** Size the button for the longer label so arming never shifts its neighbours. */
  reserveWidth?: boolean;
  onConfirm: () => void;
};

/**
 * Two-step button for destructive HUD actions (concede, undo) so a stray
 * click next to Leave never ends or rewinds a match.
 */
export function ConfirmButton({
  className = "",
  label,
  confirmLabel,
  title,
  ariaLabel,
  disabled,
  armMs = 3000,
  reserveWidth = false,
  onConfirm,
}: Props) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const id = window.setTimeout(() => setArmed(false), armMs);
    return () => window.clearTimeout(id);
  }, [armed, armMs]);

  useEffect(() => {
    if (disabled) setArmed(false);
  }, [disabled]);

  return (
    <button
      type="button"
      className={`${className}${armed ? " armed" : ""}`}
      title={title}
      aria-label={ariaLabel}
      disabled={disabled}
      aria-live="polite"
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        onConfirm();
      }}
    >
      {reserveWidth ? (
        <span className="confirm-btn-sizer">
          <span aria-hidden={armed} className={armed ? "is-hidden" : undefined}>
            {label}
          </span>
          <span aria-hidden={!armed} className={armed ? undefined : "is-hidden"}>
            {confirmLabel}
          </span>
        </span>
      ) : armed ? (
        confirmLabel
      ) : (
        label
      )}
    </button>
  );
}
