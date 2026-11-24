import { useEffect, useState, type ComponentPropsWithRef, type ReactNode } from "react";

type Props = Omit<ComponentPropsWithRef<"button">, "children" | "onClick" | "title" | "disabled" | "className"> & {
  className?: string;
  label: string;
  confirmLabel: ReactNode;
  title?: string;
  ariaLabel?: string;
  disabled?: boolean;
  armMs?: number;
  reserveWidth?: boolean;
  onConfirm: () => void;
};

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
  ...rest
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
      {...rest}
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
