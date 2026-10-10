import { Fragment, useEffect, type ReactNode } from "react";
import type { OppHandSpot } from "./panelLayout";
import { createPortal } from "react-dom";
import {
  updateSettings,
  useDuelSettings,
  type AnimationSpeed,
  type EndTurnConfirm,
  type HandLayoutPref,
  type LifeFan,
  type ResponseStops,
  type ScreenOrientationPref,
  type TextSize,
} from "../settings";
import { useLockNote } from "./orientation";
import { LAYOUT_RESET, layoutMoved } from "./layoutReset";
import { playTurnChime } from "./turnAlert";
import {
  showToggleShown,
  turnAlertCopy,
  visibleGroups,
  type FieldDevice,
  type GroupId,
  type RowKey,
  type ShowKey,
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
    hint: "Skips the second tap: a card whose pop-up has one button does it straight away (Play, Attack, Activate, +1 DON!!), Counter and Blocker taps play at once, tapping a Leader or Character gives it the selected DON!!, and an effect that wants exactly N picks resolves on the last one.",
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
    key: "attackGlow",
    label: "Attack-ready glow",
    hint: "Your Leader and Characters that can attack right now glow green.",
  },
  {
    key: "compactOwnBoard",
    label: "Simple board on phones",
    hint: "Portrait phones: shows your own cards the way your opponent's are shown: Life, Deck, DON!! deck and Trash become a row of counts, and the cards get bigger. Tap Trash or face-up Life to open it.",
  },
  {
    key: "previewBigCard",
    label: "Big card preview",
    hint: "Desktop: the card preview on the left shows just the card, as big as it fits. Off shows a smaller card with its cost, colour, power and Counter icons and its text below.",
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
    key: "bigBoard",
    label: "Bigger playing area",
    hint: "Gives the two playmats as much of the window as it can. On computers it hides the top bar (its menu moves to the ⋯ button at the top of a side column), shrinks the side columns to their minimum and trims the margins and gaps. Computers and landscape phones get wider two-row mats. A column width you dragged out comes back when this is off.",
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

type ShowToggle = { key: ShowKey; label: string; hint: string };

/** Non-core elements that can be hidden. The Battle log stays on screen, so it has no switch. */
const SHOW_TOGGLES: ShowToggle[] = [
  {
    key: "showCardPreview",
    label: "Card preview",
    hint: "Desktop: the hovered card's art and text at the top of the left column. Off gives its room to the other panels in that column.",
  },
  {
    key: "showRecentPlays",
    label: "Recent plays",
    hint: "Desktop: the strip of the latest plays and attacks in the left column. The Battle log keeps the full record.",
  },
  {
    key: "showChat",
    label: "Chat",
    hint: "Online matches: the chat panel on desktop, the Chat pill on phones and the chat button on the landscape rail.",
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

const LIFE_FAN_OPTIONS: { value: LifeFan; label: string }[] = [
  { value: "down", label: "Fans down (top card nearest you)" },
  { value: "up", label: "Fans up (top card toward the middle)" },
];

const ANIMATION_OPTIONS: { value: AnimationSpeed; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "fast", label: "Fast" },
  { value: "off", label: "Off" },
];

/** Scrolls a settings group under the sticky chip row (the group's scroll-margin-top clears it). */
function jumpToGroup(id: GroupId) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document
    .getElementById(`gp-${id}`)
    ?.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
}

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
  const groups = visibleGroups(device);
  const toggleByKey = new Map<RowKey, Toggle>(TOGGLES.map((t) => [t.key, t]));

  function renderRow(key: RowKey): ReactNode {
    const toggle = toggleByKey.get(key);
    if (toggle) {
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
    }
    switch (key) {
      case "endTurnConfirm":
        return (
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

        );
      case "responseStops":
        return (
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

        );
      case "screenOrientation":
        return (
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

        );
      case "handLayout":
        return (
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

        );
      case "sidePanels":
        return (
          <div className="field">
            <span className="field-label" id="side-panels-label">Side panels</span>
            <div className="panel-layout-row">
              <button
                type="button"
                className="btn btn-secondary"
                aria-describedby="side-panels-label"
                disabled={!layoutMoved(settings)}
                onClick={() => updateSettings({ ...LAYOUT_RESET })}
              >
                Reset layout
              </button>
            </div>
            <p className="field-hint">
              With Drag handles on, drag the grip at the top of any side panel (card preview, battle
              log, actions, Grid hand, chat ...) to snap it into the left or right column, and the
              fanned hand&apos;s grip to move it anywhere (spectating, each of the two hands has its own). Drop the opponent hand on the top of the
              playmat to pin it there. Drag the inner edge of a column, or the line between two panels, to
              resize them (double-click an edge to reset it). Reset puts every panel, size, both
              hands and moved pop-ups back.
            </p>
          </div>

        );
      case "oppHandSpot":
        return (
          <div className="field">
            <label htmlFor="opp-hand-spot">Opponent hand position</label>
            <select
              id="opp-hand-spot"
              value={settings.oppHandSpot}
              onChange={(e) => updateSettings({ oppHandSpot: e.target.value as OppHandSpot })}
            >
              <option value="">In its side panel</option>
              <option value="left">Left of the mat</option>
              <option value="centre">Top centre of the mat</option>
              <option value="right">Right of the mat</option>
            </select>
            <p className="field-hint">
              Where the opponent&apos;s hand sits on a desktop window: in the right-hand panel, or
              pinned beside or above their half of the playmat.
            </p>
          </div>

        );
      case "textSize":
        return (
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

        );
      case "lifeFan":
        return (
          <div className="field">
            <label htmlFor="life-fan">Life stack direction</label>
            <select
              id="life-fan"
              value={settings.lifeFan}
              onChange={(e) => updateSettings({ lifeFan: e.target.value as LifeFan })}
            >
              {LIFE_FAN_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="field-hint">
              Which way your Life cards fan out on your mat. The opponent&apos;s Life fans the other way
              so it mirrors yours.
            </p>
          </div>
        );
      case "animationSpeed":
        return (
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

        );
      case "cardSpotlight":
        return (
          <div className="gameplay-toggle">
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.cardSpotlight}
                disabled={settings.animationSpeed === "off"}
                onChange={(e) => updateSettings({ cardSpotlight: e.target.checked })}
              />
              <span>Show played, trashed and drawn cards</span>
            </label>
            <p className="field-hint">
              Each card that is played, used as a Counter, K.O.&apos;d or trashed by an effect (from
              hand, deck, Life or the field) shows big over its owner&apos;s side for a moment, then
              drops into its spot. Follows the Animations speed; Off hides it too.
            </p>
          </div>

        );
      case "showOnScreen":
        return (
          <div className="field gameplay-group" role="group" aria-labelledby="show-on-screen-label">
            <span className="field-label" id="show-on-screen-label">Show on screen</span>
            <p className="field-hint">
              Hide the extras you don&apos;t use. Your hand, DON!!, Life, the turn and the Battle log always
              stay; panels you hide keep their place in your layout.
            </p>
            {SHOW_TOGGLES.filter((t) => showToggleShown(t.key, device)).map((t) => (
              <div className="gameplay-toggle" key={t.key}>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={settings[t.key]}
                    onChange={(e) => updateSettings({ [t.key]: e.target.checked })}
                  />
                  <span>{t.label}</span>
                </label>
                <p className="field-hint">{t.hint}</p>
              </div>
            ))}
          </div>

        );
      default:
        return null;
    }
  }

  return (
    <div className="gameplay-settings">
      <nav className="settings-group-jump" aria-label="Gameplay sections">
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            className="settings-group-chip"
            onClick={() => jumpToGroup(g.id)}
          >
            {g.chip}
          </button>
        ))}
      </nav>
      {groups.map((g) => (
        <section
          key={g.id}
          className="settings-group"
          id={`gp-${g.id}`}
          aria-labelledby={`gp-${g.id}-title`}
        >
          <h3 className="settings-group-title" id={`gp-${g.id}-title`}>
            {g.title}
          </h3>
          {g.rows.map((r) => (
            <Fragment key={r}>{renderRow(r)}</Fragment>
          ))}
        </section>
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
