import { useEffect, useState } from "react";

type Props = {
  className?: string;
  label: string;
  /** Shown after the first click; a second click within `armMs` confirms. */
  confirmLabel: string;
  title?: string;
  disabled?: boolean;
  armMs?: number;
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
  disabled,
  armMs = 3000,
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
      {armed ? confirmLabel : label}
    </button>
  );
}
