import { Fragment, type ReactNode } from "react";
import type { OppHandSpot } from "./panelLayout";
import { Dialog, Select } from "@optcg/ui/popups";
import {
  updateSettings,
  useDuelSettings,
  type AnimationSpeed,
  type EndTurnConfirm,
  type HandLayoutPref,
  type LifeFan,
  type SideColumns,
  type ResponseStops,
  type ScreenOrientationPref,
  type TextSize,
} from "../settings";
import { useLockNote } from "./orientation";
import { LAYOUT_RESET, layoutMoved } from "./layoutReset";
import { POPUP_SIZE_MAX, POPUP_SIZE_MIN, POPUP_SIZE_STEP, clampPopupSize } from "./popupSize";
import { playTurnChime } from "./turnAlert";
import {
  showToggleShown,
  turnAlertCopy,
  rowDisabledNote,
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
  PORTRAIT_MAT_QUERY,
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
    hint: "The hand stays up instead of tucking away. Press H during a match to hide it.",
  },
  {
    key: "layoutGrips",
    label: "Drag handles",
    hint: "Shows grips for moving the side panels and the hand. Your layout stays when it's off.",
  },
  {
    key: "oneTapActions",
    label: "One-tap actions",
    hint: "Skips the confirm tap: one-button actions, Counters, Blockers and DON!! happen on the first tap.",
  },
  {
    key: "dimUnplayable",
    label: "Gray out unplayable cards",
    hint: "In your main phase, fades hand cards you can't play.",
  },
  {
    key: "handCounters",
    label: "Counter values on hand cards",
    hint: "Shows each hand card's Counter value as a badge.",
  },
  {
    key: "cantAttackWarning",
    label: "Can't attack warning",
    hint: "A card that can't attack flashes red and says why.",
  },
  {
    key: "battleArrow",
    label: "Battle arrow",
    hint: "Draws an arc from the attacker to its target.",
  },
  {
    key: "attackGlow",
    label: "Attack-ready glow",
    hint: "Cards that can attack right now glow green.",
  },
  {
    key: "compactOwnBoard",
    label: "Simple board on phones",
    hint: "Portrait phones: your Life, Deck, DON!! and Trash become counts, so your cards get bigger.",
  },
  {
    key: "previewBigCard",
    label: "Big card preview",
    hint: "Shows just the card, as big as it fits. Off adds its stats and text.",
  },
  {
    key: "previewPopup",
    label: "Card preview pop-up",
    hint: "Shows the card preview as a pop-up you can drag, instead of a side panel. Needs Card preview on.",
  },
  {
    key: "donUpright",
    label: "Upright DON!! on rested cards",
    hint: "DON!! stays upright when the card it's on rests.",
  },
  {
    key: "totalPower",
    label: "Show total power",
    hint: "Shows only the total power: green when raised, red when lowered. Hover a card for the breakdown.",
  },
  {
    key: "shortcutTags",
    label: "Shortcut key tags",
    hint: "Shows each action's key on its button. The keys work either way.",
  },
  {
    key: "oppHandTopRight",
    label: "Opponent hand, top right",
    hint: "Shows the opponent's hand on the right of their side instead of the left.",
  },
  {
    key: "tiltedBoard",
    label: "Tilted board",
    hint: "The board leans away from you like a real table.",
  },
  {
    key: "bigBoard",
    label: "Bigger playing area",
    hint: "Gives the playmats as much of the window as it can: hides the top bar and trims the columns and margins.",
  },
  {
    key: "actionsBeside",
    label: "Buttons beside the board",
    hint: "Puts the action buttons beside the mats so the mats touch. Off puts them in a strip between the mats.",
  },
  {
    key: "turnSplash",
    label: "Turn banner",
    hint: "Shows “Your turn” / “Opponent's turn” over the board.",
  },
  {
    key: "gameHints",
    label: "Opening hand tips",
    hint: "Explains Keep, Mulligan and who goes first during the mulligan.",
  },
  {
    key: "reduceMotion",
    label: "Reduce animations",
    hint: "Calmer attack arcs, banners and hand motion.",
  },
  {
    key: "turnAlert",
    label: "Vibration",
    hint: "Buzzes on supported phones (Android) for card moves, attacks and your turn.",
  },
  {
    key: "turnSound",
    label: "Sounds",
    hint: "A chime on your turn, plus short sounds for plays, attacks, K.O.s and more. Works on iPhone too.",
  },
];

type ShowToggle = { key: ShowKey; label: string; hint: string };

/** Non-core elements that can be hidden. The Battle log stays on screen, so it has no switch. */
const SHOW_TOGGLES: ShowToggle[] = [
  {
    key: "showCardPreview",
    label: "Card preview",
    hint: "The hovered card's art and text, at the top of the left column.",
  },
  {
    key: "showRecentPlays",
    label: "Recent plays",
    hint: "The latest plays and attacks. The Battle log keeps the full record.",
  },
  {
    key: "showChat",
    label: "Chat",
    hint: "The chat panel or Chat button in online matches.",
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
  // Upright phone: some rows do nothing in one orientation, so they are disabled with a note.
  const portrait = useMediaQuery(PORTRAIT_MAT_QUERY);
  const device: FieldDevice = { desktop, tiltFits, finePointer, portrait };
  const noteFor = (key: RowKey) => rowDisabledNote(key, device, settings);
  const disabledNote = (note: string | null) =>
    note ? (
      <p className="field-hint field-note" role="note">
        {note}
      </p>
    ) : null;
  const groups = visibleGroups(device);
  const toggleByKey = new Map<RowKey, Toggle>(TOGGLES.map((t) => [t.key, t]));

  function renderRow(key: RowKey): ReactNode {
    const toggle = toggleByKey.get(key);
    if (toggle) {
      const t = toggle.key === "turnAlert" ? { ...toggle, ...turnAlertCopy(device, toggle) } : toggle;
      const note = noteFor(t.key);
      return (
        <div className="gameplay-toggle" key={t.key}>
          <label className="switch">
            <input
              type="checkbox"
              checked={
                t.key === "oppHandTopRight" ? settings.oppHandSpot === "right" : settings[t.key]
              }
              disabled={note !== null}
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
          {disabledNote(note)}
        </div>
      );
    }
    switch (key) {
      case "endTurnConfirm":
        return (
          <div className="field">
            <label htmlFor="end-turn-confirm">Confirm before ending turn</label>
            <Select
              id="end-turn-confirm"
              value={settings.endTurnConfirm}
              onChange={(v) => updateSettings({ endTurnConfirm: v })}
              options={END_TURN_OPTIONS}
            />
            <p className="field-hint">
              The middle option asks only while you have active DON!! or a ready attacker.
            </p>
          </div>

        );
      case "responseStops":
        return (
          <div className="field">
            <label htmlFor="response-stops">Stop for block and counter</label>
            <Select
              id="response-stops"
              value={settings.responseStops}
              onChange={(v) => updateSettings({ responseStops: v })}
              options={RESPONSE_STOP_OPTIONS}
            />
            <p className="field-hint">
              Auto passes when you can&apos;t block or counter. Smart also passes when your Counters can&apos;t save the card.
            </p>
          </div>

        );
      case "screenOrientation":
        return (
          <div className="field">
            <label htmlFor="screen-orientation">Screen orientation</label>
            <Select
              id="screen-orientation"
              value={settings.screenOrientation}
              onChange={(v) => updateSettings({ screenOrientation: v })}
              options={ORIENTATION_OPTIONS}
            />
            <p className="field-hint">
              Locks rotation during a match where the browser allows it (Android, full screen or installed).
            </p>
            {lockNote ? (
              <p className="field-hint field-note" role="status">
                Your browser can&apos;t lock rotation here, so turn your phone instead.
              </p>
            ) : null}
          </div>

        );
      case "handLayout":
        return (
          <div className="field">
            <label htmlFor="hand-layout">Hand layout</label>
            <Select
              id="hand-layout"
              disabled={noteFor("handLayout") !== null}
              value={settings.handLayout}
              onChange={(v) => updateSettings({ handLayout: v })}
              options={HAND_LAYOUT_OPTIONS}
            />
            <p className="field-hint">
              {desktop
                ? "Automatic uses Grid on tall windows and Fan elsewhere. Fan tucks under the board; Grid is a side panel you can move."
                : "Fan overlaps the cards so they all fit; Grid lays them out and scrolls."}
            </p>
            {disabledNote(noteFor("handLayout"))}
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
              With Drag handles on, drag a panel&apos;s grip to move it, or an edge to resize it (double-click to reset). Reset layout puts every panel, hand and pop-up back.
            </p>
          </div>

        );
      case "sideColumns":
        return (
          <div className="field">
            <label htmlFor="side-columns">Side columns</label>
            <Select
              id="side-columns"
              value={settings.sideColumns}
              onChange={(v) => updateSettings({ sideColumns: v })}
              options={[
                { value: "right", label: "One, on the right" },
                { value: "left", label: "One, on the left" },
                { value: "both", label: "Both" },
              ]}
            />
            <p className="field-hint">
              One column gives the board more room. Both keeps a column on each side.
            </p>
          </div>

        );
      case "oppHandSpot":
        return (
          <div className="field">
            <label htmlFor="opp-hand-spot">Opponent hand position</label>
            <Select
              id="opp-hand-spot"
              value={settings.oppHandSpot}
              onChange={(v) => updateSettings({ oppHandSpot: v })}
              options={[
                { value: "", label: "In its side panel" },
                { value: "left", label: "Left of the mat" },
                { value: "centre", label: "Top centre of the mat" },
                { value: "right", label: "Right of the mat" },
              ]}
            />
            <p className="field-hint">
              Where the opponent&apos;s hand sits: in a side panel, or pinned to their half of the mat.
            </p>
          </div>

        );
      case "textSize":
        return (
          <div className="field">
            <label htmlFor="text-size">Text size</label>
            <Select
              id="text-size"
              value={settings.textSize}
              onChange={(v) => updateSettings({ textSize: v })}
              options={TEXT_SIZE_OPTIONS}
            />
            <p className="field-hint">
              Makes text and card power numbers bigger or smaller.
            </p>
          </div>

        );
      case "lifeFan":
        return (
          <div className="field">
            <label htmlFor="life-fan">Life stack direction</label>
            <Select
              id="life-fan"
              disabled={noteFor("lifeFan") !== null}
              value={settings.lifeFan}
              onChange={(v) => updateSettings({ lifeFan: v })}
              options={LIFE_FAN_OPTIONS}
            />
            <p className="field-hint">
              Which way your Life cards fan out. The opponent&apos;s Life mirrors yours.
            </p>
            {disabledNote(noteFor("lifeFan"))}
          </div>
        );
      case "animationSpeed":
        return (
          <div className="field">
            <label htmlFor="animation-speed">Animation speed</label>
            <Select
              id="animation-speed"
              value={settings.animationSpeed}
              onChange={(v) => updateSettings({ animationSpeed: v })}
              options={ANIMATION_OPTIONS}
            />
            <p className="field-hint">
              How fast cards move for draws, plays and K.O.s.
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
              <span>Spotlight played and K.O.&apos;d cards</span>
            </label>
            <p className="field-hint">
              Cards that are played, used as a Counter, K.O.&apos;d or trashed show big for a moment. Off when Animation speed is Off.
            </p>
          </div>

        );
      case "popupSize":
        return (
          <div className="field">
            <label htmlFor="popup-size">Pop-up size · {settings.popupSize}%</label>
            <input
              id="popup-size"
              type="range"
              className="range"
              min={POPUP_SIZE_MIN}
              max={POPUP_SIZE_MAX}
              step={POPUP_SIZE_STEP}
              value={settings.popupSize}
              onChange={(e) => updateSettings({ popupSize: clampPopupSize(Number(e.target.value)) })}
            />
            <p className="field-hint">
              Size of choice, search and action pop-ups. The − and + in a pop-up’s top bar change it too.
            </p>
          </div>
        );
      case "previewPopupSize":
        return (
          <div className="field">
            <label htmlFor="preview-popup-size">Card pop-up size · {settings.previewPopupSize}%</label>
            <input
              id="preview-popup-size"
              type="range"
              className="range"
              min={POPUP_SIZE_MIN}
              max={POPUP_SIZE_MAX}
              step={POPUP_SIZE_STEP}
              value={settings.previewPopupSize}
              onChange={(e) => updateSettings({ previewPopupSize: clampPopupSize(Number(e.target.value)) })}
            />
            <p className="field-hint">
              Size of the hover card pop-up. The − and + in its top bar change it too.
            </p>
          </div>
        );
      case "showOnScreen":
        return (
          <div className="field gameplay-group" role="group" aria-labelledby="show-on-screen-label">
            <span className="field-label" id="show-on-screen-label">Show on screen</span>
            <p className="field-hint">
              Hide extras you don&apos;t use. Hidden panels keep their place in your layout.
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
  return (
    <Dialog open onClose={onClose} className="sheet-backdrop" panelClassName="sheet" label="Gameplay settings">
      <div className="sheet-head">
        <span className="icon-btn-spacer" aria-hidden />
        <h2 className="sheet-title">Gameplay</h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </div>
      <GameplaySettingsFields />
    </Dialog>
  );
}
