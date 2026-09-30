import { useEffect } from "react";
import { createPortal } from "react-dom";
import {
  updateSettings,
  useDuelSettings,
  type AnimationSpeed,
  type EndTurnConfirm,
  type HandLayout,
  type ResponseStops,
  type ScreenOrientationPref,
} from "../settings";
import { useLockNote } from "./orientation";
import { playTurnChime } from "./turnAlert";

type Toggle = {
  key:
    | "sortHandByCost"
    | "keepHandOpen"
    | "tiltedBoard"
    | "turnSplash"
    | "reduceMotion"
    | "turnAlert"
    | "turnSound";
  label: string;
  hint: string;
};

const TOGGLES: Toggle[] = [
  {
    key: "sortHandByCost",
    label: "Sort hand by cost",
    hint: "Starts each match with the hand's Sort button on.",
  },
  {
    key: "keepHandOpen",
    label: "Keep hand open",
    hint: "Desktop: the fanned hand (or the corner dock in short windows) stays up instead of tucking away. H toggles it during a match. The grid in the right column is always open.",
  },
  {
    key: "tiltedBoard",
    label: "Tilted board",
    hint: "Desktop: the board leans away from you like a real table, so the opponent's side is a little smaller and further back.",
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
    label: "Vibration",
    hint: "Short buzzes on supported phones (Android) for picking up and dropping cards, incoming attacks and your move. Also marks the browser tab while you're away.",
  },
  {
    key: "turnSound",
    label: "Sounds",
    hint: "A chime when your turn starts or you need to respond, a lower two-tone cue when you are attacked, a soft tick when the opponent plays a card, and a thud when a Life card is lost. Works on iPhone too.",
  },
];

const END_TURN_OPTIONS: { value: EndTurnConfirm; label: string }[] = [
  { value: "always", label: "Always ask" },
  { value: "actions", label: "Only if DON!! or attackers are left" },
  { value: "never", label: "Never ask" },
];

const RESPONSE_STOP_OPTIONS: { value: ResponseStops; label: string }[] = [
  { value: "always", label: "Always stop" },
  { value: "auto", label: "Auto: skip when I have no answer" },
  { value: "smart", label: "Smart: also skip when I can't survive" },
];

const ORIENTATION_OPTIONS: { value: ScreenOrientationPref; label: string }[] = [
  { value: "auto", label: "Follow my phone" },
  { value: "portrait", label: "Portrait" },
  { value: "landscape", label: "Landscape" },
];

const HAND_LAYOUT_OPTIONS: { value: HandLayout; label: string }[] = [
  { value: "fanCenter", label: "Fan, bottom centre" },
  { value: "fanRight", label: "Fan, bottom right" },
  { value: "grid", label: "Grid (no fan)" },
];

const ANIMATION_OPTIONS: { value: AnimationSpeed; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "fast", label: "Fast" },
  { value: "off", label: "Off" },
];

/** Gameplay preferences; saved in this browser and applied live. */
export function GameplaySettingsFields() {
  const settings = useDuelSettings();
  const lockNote = useLockNote(settings.screenOrientation);
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
          “Only if DON!! or attackers are left” asks while you have active DON!! or a ready attacker, and the button says which.
        </p>
      </div>
      <div className="field">
        <label htmlFor="response-stops">Stop for block and counter</label>
        <select
          id="response-stops"
          value={settings.responseStops}
          onChange={(e) => updateSettings({ responseStops: e.target.value as ResponseStops })}
        >
          {RESPONSE_STOP_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="field-hint">
          Auto passes for you when you have no blocker or Counter card. Smart also passes the
          counter step when all your Counter cards together can't save the attacked card;
          Counter events always stop you. Your opponent may notice a quick pass.
        </p>
      </div>
      <div className="field">
        <label htmlFor="screen-orientation">Screen orientation</label>
        <select
          id="screen-orientation"
          value={settings.screenOrientation}
          onChange={(e) =>
            updateSettings({ screenOrientation: e.target.value as ScreenOrientationPref })
          }
        >
          {ORIENTATION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="field-hint">
          Locks rotation while a match is open, where the browser allows it (Android, in full
          screen or when installed).
        </p>
        {lockNote ? (
          <p className="field-hint field-note" role="status">
            Your browser can&apos;t lock rotation here; turn your phone instead (Android: try Full
            screen from the ⋯ menu).
          </p>
        ) : null}
      </div>
      <div className="field">
        <label htmlFor="hand-layout">Hand</label>
        <select
          id="hand-layout"
          value={settings.handLayout}
          onChange={(e) => updateSettings({ handLayout: e.target.value as HandLayout })}
        >
          {HAND_LAYOUT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="field-hint">
          Desktop: the fan peeks off the bottom of the board (centre) or of the right column, and
          rises when you point at it. Grid keeps the hand open in the right column. Phones: either
          fan overlaps the hand strip so every card fits without scrolling.
        </p>
      </div>
      <div className="field">
        <label htmlFor="animation-speed">Animations</label>
        <select
          id="animation-speed"
          value={settings.animationSpeed}
          onChange={(e) => updateSettings({ animationSpeed: e.target.value as AnimationSpeed })}
        >
          {ANIMATION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="field-hint">
          How fast cards fly for draws, plays and KOs. Off skips card motion. “Reduce animations”
          keeps its short fade instead of Normal or Fast.
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
