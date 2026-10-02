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
  type TextSize,
} from "../settings";
import { useLockNote } from "./orientation";
import { playTurnChime } from "./turnAlert";
import { DESKTOP_BOARD_QUERY, TILT_BOARD_QUERY, useMediaQuery } from "./useMediaQuery";

type Toggle = {
  key:
    | "sortHandByCost"
    | "keepHandOpen"
    | "layoutGrips"
    | "oneTapActions"
    | "oppHandTopRight"
    | "tiltedBoard"
    | "floatingCards"
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
    hint: "Desktop: the fanned hand (or the corner dock in short windows) stays up instead of tucking away. It can cover your DON!! row and Trash: press H or its Hide button during a match to hide the hand completely, and again to bring it back.",
  },
  {
    key: "layoutGrips",
    label: "Drag handles",
    hint: "Desktop: shows a grip on each side panel and on the fanned hand so you can move them. Turn it off to hide the grips once your layout is set; the layout stays.",
  },
  {
    key: "oneTapActions",
    label: "One-tap actions",
    hint: "Skips the second tap: tapping a Counter card plays it, tapping a Blocker blocks, tapping a Leader or Character gives it the selected DON!!, and picking the only target of an effect resolves it.",
  },
  {
    key: "oppHandTopRight",
    label: "Opponent hand, top right",
    hint: "Shows the opponent's hand as a fan of card backs with the count in the top-right corner, mirroring your own hand. Portrait phones: a compact row at the right of the opponent's half.",
  },
  {
    key: "tiltedBoard",
    label: "Tilted board",
    hint: "Desktop and landscape tablets: the board leans away from you like a real table, so the opponent's side is a little smaller and further back.",
  },
  {
    key: "floatingCards",
    label: "Floating cards",
    hint: "Searches and ordering effects lay their cards out over the board: tap to take, drag to reorder. Off shows them in a pop-up box instead.",
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
    hint: "A chime when your turn starts or you need to respond, a lower two-tone cue when you are attacked, a thud when a Life card is lost, and short effects for drawing, playing, attacking, blocking, countering, K.O.s, DON!!, Triggers and the result. Works on iPhone too.",
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
  { value: "fan", label: "Fan" },
  { value: "grid", label: "Grid" },
];

const TEXT_SIZE_OPTIONS: { value: TextSize; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
  { value: "xlarge", label: "Extra large" },
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
  // Phones and tall windows keep the flat board, so the switch would do nothing there.
  const tiltFits = useMediaQuery(TILT_BOARD_QUERY);
  // Phones keep their fixed layout, so only desktop windows offer the panel reset.
  const desktop = useMediaQuery(DESKTOP_BOARD_QUERY);
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
          Desktop: the fan peeks off the bottom of the board and rises when you point at it; drag
          its grip to put it anywhere on the screen (on the bottom edge it still tucks away). Grid
          keeps the hand open as a side panel you can move to either column. Phones: the fan
          overlaps the hand strip so every card fits without scrolling.
        </p>
      </div>
      {desktop ? (
        <div className="field">
          <span className="field-label" id="side-panels-label">Side panels</span>
          <div className="panel-layout-row">
            <button
              type="button"
              className="btn btn-secondary"
              aria-describedby="side-panels-label"
              disabled={!settings.panelLayout && !settings.handFanPos}
              onClick={() => updateSettings({ panelLayout: "", handFanPos: "" })}
            >
              Reset layout
            </button>
          </div>
          <p className="field-hint">
            With Drag handles on, drag the grip at the top of any side panel (card preview, battle
            log, actions, Grid hand, chat ...) to snap it into the left or right column, and the
            fanned hand&apos;s grip to move it anywhere. Reset puts every panel and the hand back.
          </p>
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="text-size">Text size</label>
        <select
          id="text-size"
          value={settings.textSize}
          onChange={(e) => updateSettings({ textSize: e.target.value as TextSize })}
        >
          {TEXT_SIZE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="field-hint">
          Text already grows with your window; this sets it larger or smaller on top, including
          card power numbers and the card text on the left.
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
      {TOGGLES.filter(
        (t) => (t.key !== "tiltedBoard" || tiltFits) && (t.key !== "layoutGrips" || desktop),
      ).map((t) => (
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
