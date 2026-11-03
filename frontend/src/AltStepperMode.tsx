import { useEffect, useState } from "react";

/** What the alt-art tile steppers edit on the planner: owned copies, or copies to buy (#906). */
export type AltStepperMode = "owned" | "buy";

export const ALT_STEPPER_MODE_KEY = "optcg_alt_stepper_mode";

export function readAltStepperMode(): AltStepperMode {
  try {
    return localStorage.getItem(ALT_STEPPER_MODE_KEY) === "buy" ? "buy" : "owned";
  } catch {
    return "owned";
  }
}

export function useAltStepperMode() {
  const [mode, setMode] = useState<AltStepperMode>(readAltStepperMode);
  useEffect(() => {
    try {
      localStorage.setItem(ALT_STEPPER_MODE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, [mode]);
  return [mode, setMode] as const;
}

/** Owned | Buy segmented switch. Fixed size so it never shoves its neighbours. */
export function AltStepperSwitch({
  mode,
  onChange,
}: {
  mode: AltStepperMode;
  onChange: (mode: AltStepperMode) => void;
}) {
  return (
    <span className="alt-mode-switch" role="group" aria-label="Alt art steppers">
      {(["owned", "buy"] as const).map((m) => (
        <button
          key={m}
          type="button"
          className="alt-mode-btn"
          aria-pressed={mode === m}
          onClick={() => onChange(m)}
        >
          {m === "owned" ? "Owned" : "Buy"}
        </button>
      ))}
    </span>
  );
}

/** The one row above the phone list / grid layouts: "Alt art steppers [Owned | Buy]". */
export function AltStepperModeRow({
  mode,
  onChange,
}: {
  mode: AltStepperMode;
  onChange: (mode: AltStepperMode) => void;
}) {
  return (
    <div className="alt-mode-row">
      <span className="alt-mode-label">Alt art steppers</span>
      <AltStepperSwitch mode={mode} onChange={onChange} />
    </div>
  );
}
