import { useEffect } from "react";
import type { OppHandSpot } from "./panelLayout";
import { createPortal } from "react-dom";
import {
  updateSettings,
  useDuelSettings,
  type AnimationSpeed,
  type EndTurnConfirm,
  type HandLayoutPref,
  type ResponseStops,
  type ScreenOrientationPref,
  type TextSize,
} from "../settings";
import { useLockNote } from "./orientation";
import { playTurnChime } from "./turnAlert";
import {
  showOrientation,
  toggleShown,
  turnAlertCopy,
  type FieldDevice,
  type ToggleKey,
} from "./gameplayFields";
import {
  DESKTOP_BOARD_QUERY,
  FINE_POINTER_QUERY,
  TILT_BOARD_QUERY,
  useMediaQuery,
} from "./useMediaQuery";

type Toggle = {
  /** Boolean settings, plus the phone switch for oppHandSpot "right". */
  key: ToggleKey;
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
    key: "dimUnplayable",
    label: "Gray out unplayable cards",
    hint: "In your main phase, fades hand cards that cost more than your active DON!! and have no other play. Turn it off to keep every card at full colour.",
  },
  {
    key: "handCounters",
    label: "Counter values on hand cards",
    hint: "Shows each hand card's Counter (+1000, +2000) as a badge on the card.",
  },
  {
    key: "cantAttackWarning",
    label: "Can't attack warning",
    hint: "When you try to attack with a card that can't (summoning sick, rested, already attacked), it flashes red, shakes and says why.",
  },
  {
    key: "battleArrow",
    label: "Battle arrow",
    hint: "Draws the cannon-shot arc from the attacking card to its target during a battle.",
  },
  {
    key: "donUpright",
    label: "Upright DON!! on rested cards",
    hint: "DON!! given to a Leader or Character stays upright under it when the card rests, instead of turning sideways with it.",
  },
  {
    key: "shortcutTags",
    label: "Shortcut key tags",
    hint: "Shows the key for each action (Space, A, E, P, D, 1 to 9) on its button. The keys still work with the tags off.",
  },
  {
    key: "oppHandTopRight",
    label: "Opponent hand, top right",
    hint: "Puts the opponent's hand count and card backs at the right of their half instead of the left. Landscape phones: a row of backs at the top of the right column instead of just the count.",
  },
  {
    key: "tiltedBoard",
    label: "Tilted board",
    hint: "Desktop and landscape tablets: the board leans away from you like a real table, so your cards come out bigger and the opponent's side is a little smaller and further back.",
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

const HAND_LAYOUT_OPTIONS: { value: HandLayoutPref; label: string }[] = [
  { value: "auto", label: "Automatic" },
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
  // Orientation lock and vibration are for phones and tablets, not a mouse and keyboard.
  const finePointer = useMediaQuery(FINE_POINTER_QUERY);
  const device: FieldDevice = { desktop, tiltFits, finePointer };
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
      {showOrientation(device) ? (
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
      ) : null}
      <div className="field">
        <label htmlFor="hand-layout">Hand</label>
        <select
          id="hand-layout"
          value={settings.handLayout}
          onChange={(e) => updateSettings({ handLayout: e.target.value as HandLayoutPref })}
        >
          {HAND_LAYOUT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="field-hint">
          {desktop
            ? "Automatic is the Grid on a desktop window at least 680 px tall (it never covers your DON!! row) and the fan elsewhere. The fan peeks off the bottom of the board and rises when you point at it; drag its grip to put it anywhere on the screen (on the bottom edge it still tucks away). Grid keeps the hand open as a side panel you can move to either column."
            : "Fan overlaps the hand so every card fits; Grid shows them side by side and scrolls."}
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
              disabled={!settings.panelLayout && !settings.panelSizes && !settings.handFanPos && !settings.oppHandSpot}
              onClick={() => updateSettings({ panelLayout: "", panelSizes: "", handFanPos: "", oppHandSpot: "" })}
            >
              Reset layout
            </button>
          </div>
          <p className="field-hint">
            With Drag handles on, drag the grip at the top of any side panel (card preview, battle
            log, actions, Grid hand, chat ...) to snap it into the left or right column, and the
            fanned hand&apos;s grip to move it anywhere. Drop the opponent hand on the top of the
            playmat to pin it there. Drag the inner edge of a column, or the line between two panels, to
            resize them (double-click an edge to reset it). Reset puts every panel, size and both
            hands back.
          </p>
        </div>
      ) : null}
      {desktop ? (
        <div className="field">
          <label htmlFor="opp-hand-spot">Opponent hand position</label>
          <select
            id="opp-hand-spot"
            value={settings.oppHandSpot}
            onChange={(e) => updateSettings({ oppHandSpot: e.target.value as OppHandSpot })}
          >
            <option value="">In its side panel</option>
            <option value="left">Top left of the mat</option>
            <option value="centre">Top centre of the mat</option>
            <option value="right">Top right of the mat</option>
          </select>
          <p className="field-hint">
            Where the opponent&apos;s hand sits on a desktop window: in the right-hand panel, or
            pinned above their half of the playmat.
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
      <div className="gameplay-toggle">
        <label className="switch">
          <input
            type="checkbox"
            checked={settings.cardSpotlight}
            disabled={settings.animationSpeed === "off"}
            onChange={(e) => updateSettings({ cardSpotlight: e.target.checked })}
          />
          <span>Show played and trashed cards</span>
        </label>
        <p className="field-hint">
          Each card that is played, used as a Counter, K.O.&apos;d or trashed by an effect (from
          hand, deck, Life or the field) shows big over its owner&apos;s side for a moment, then
          drops into its spot. Follows the Animations speed; Off hides it too.
        </p>
      </div>
      {TOGGLES.filter((t) => toggleShown(t.key, device)).map((toggle) => {
        const t = toggle.key === "turnAlert" ? { ...toggle, ...turnAlertCopy(device, toggle) } : toggle;
        return (
          <div className="gameplay-toggle" key={t.key}>
            <label className="switch">
              <input
                type="checkbox"
                checked={
                  t.key === "oppHandTopRight" ? settings.oppHandSpot === "right" : settings[t.key]
                }
                onChange={(e) => {
                  if (t.key === "oppHandTopRight") {
                    updateSettings({ oppHandSpot: e.target.checked ? "right" : "" });
                    return;
                  }
                  updateSettings({ [t.key]: e.target.checked });
                  // Preview (and unlock audio on mobile with this tap).
                  if (t.key === "turnSound" && e.target.checked) playTurnChime();
                }}
              />
              <span>{t.label}</span>
            </label>
            <p className="field-hint">{t.hint}</p>
          </div>
        );
      })}
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
