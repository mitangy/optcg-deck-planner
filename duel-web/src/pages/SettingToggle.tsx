import type { ReactNode } from "react";

export function SettingToggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint: ReactNode;
}) {
  return (
    <div className="gameplay-toggle">
      <label className="switch">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span>{label}</span>
      </label>
      <p className="field-hint">{hint}</p>
    </div>
  );
}
