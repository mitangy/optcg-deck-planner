import { useId } from "react";
import type { ReactNode } from "react";

/** One settings switch. The label and its hint are a single hit target (#1389): tapping the hint toggles too. */
export function SettingToggle({
  checked,
  onChange,
  label,
  hint,
  disabled = false,
  note,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint: ReactNode;
  disabled?: boolean;
  /** Why the row is disabled, shown under it. */
  note?: string | null;
}) {
  const id = useId();
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  return (
    <div className="gameplay-toggle">
      <label className="switch switch-row">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-labelledby={labelId}
          aria-describedby={hintId}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="switch-text">
          <span className="switch-label" id={labelId}>
            {label}
          </span>
          <span className="field-hint switch-hint" id={hintId}>
            {hint}
          </span>
        </span>
      </label>
      {note ? (
        <p className="field-hint field-note" role="note">
          {note}
        </p>
      ) : null}
    </div>
  );
}
