import { useEffect } from "react";
import { createPortal } from "react-dom";
import { updateSettings, useDuelSettings, type EndTurnConfirm } from "../settings";
import { playTurnChime } from "./turnAlert";

type Toggle = {
  key:
    | "autoPassDefense"
    | "sortHandByCost"
    | "keepHandOpen"
    | "turnSplash"
    | "reduceMotion"
    | "turnAlert"
    | "turnSound";
  label: string;
  hint: string;
};

const TOGGLES: Toggle[] = [
  {
    key: "autoPassDefense",
    label: "Auto-pass block and counter",
    hint: "Passes for you when you have no blocker or no counter to use. Your opponent may notice the quick pass.",
  },
  {
    key: "sortHandByCost",
    label: "Sort hand by cost",
    hint: "Starts each match with the hand's Sort button on.",
  },
  {
    key: "keepHandOpen",
    label: "Keep hand open",
    hint: "Wide screens: the hand dock stays up instead of tucking away.",
  },
  {
    key: "turnSplash",
    label: "Turn banner",
    hint: "Shows “Your turn” / “Opponent's turn” over the board.",
  },
  {
    key: "reduceMotion",
    label: "Reduce animations",
    hint: "Calmer attack arcs, banners and hand motion.",
  },
  {
    key: "turnAlert",
    label: "Buzz when it's your move",
    hint: "Vibrates on supported phones and marks the browser tab while you're away.",
  },
  {
    key: "turnSound",
    label: "Chime when it's your move",
    hint: "A short sound when your turn starts or you need to respond.",
  },
];

const END_TURN_OPTIONS: { value: EndTurnConfirm; label: string }[] = [
  { value: "always", label: "Always ask" },
  { value: "actions", label: "Only if I can still act" },
  { value: "never", label: "Never ask" },
];

/** Gameplay preferences; saved in this browser and applied live. */
export function GameplaySettingsFields() {
  const settings = useDuelSettings();
  return (
    <div className="gameplay-settings">
      <div className="field">
        <label htmlFor="end-turn-confirm">Confirm before ending turn</label>
        <select
          id="end-turn-confirm"
          value={settings.endTurnConfirm}
          onChange={(e) => updateSettings({ endTurnConfirm: e.target.value as EndTurnConfirm })}
        >
          {END_TURN_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="field-hint">
          “Only if I can still act” asks while you have DON!!, an attack or a playable card left.
        </p>
      </div>
      {TOGGLES.map((t) => (
        <div className="gameplay-toggle" key={t.key}>
          <label className="switch">
            <input
              type="checkbox"
              checked={settings[t.key]}
              onChange={(e) => {
                updateSettings({ [t.key]: e.target.checked });
                // Preview (and unlock audio on mobile with this tap).
                if (t.key === "turnSound" && e.target.checked) playTurnChime();
              }}
            />
            <span>{t.label}</span>
          </label>
          <p className="field-hint">{t.hint}</p>
        </div>
      ))}
    </div>
  );
}

/** In-match sheet so settings change without leaving the game. */
export function GameplaySettingsSheet({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="sheet-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Gameplay settings">
        <div className="sheet-head">
          <span className="icon-btn-spacer" aria-hidden />
          <h2 className="sheet-title">Gameplay</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <GameplaySettingsFields />
      </div>
    </div>,
    document.body,
  );
}
