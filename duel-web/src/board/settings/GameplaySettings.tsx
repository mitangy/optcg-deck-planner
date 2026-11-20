import { Fragment, type ReactNode } from "react";
import type { OppHandSpot } from "../panels/panelLayout";
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
} from "../../settings";
import { useLockNote } from "../layout/orientation";
import { LAYOUT_RESET, layoutMoved } from "../layout/layoutReset";
import { POPUP_SIZE_MAX, POPUP_SIZE_MIN, POPUP_SIZE_STEP, clampPopupSize } from "../preview/popupSize";
import { ROW_TEXT, rowSearchText } from "./gameplayText";
import { playTurnChime } from "../audio/turnAlert";
import {
  filterGroupsByQuery,
  hiddenRowsNote,
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
  SIDEWAYS_FAN_QUERY,
  TILT_BOARD_QUERY,
  useMediaQuery,
} from "../layout/useMediaQuery";

type Toggle = {
  key: ToggleKey;
  label: string;
  hint: string;
  invert?: boolean;
};

// Which rows are switches. Their words come from ROW_TEXT, the same source the Settings search reads.
const TOGGLE_KEYS: { key: ToggleKey; invert?: boolean }[] = [
  { key: "sortHandByCost" },
  { key: "keepHandOpen" },
  { key: "layoutGrips" },
  { key: "oneTapActions" },
  { key: "dimUnplayable" },
  { key: "handCounters" },
  { key: "cantAttackWarning" },
  { key: "battleArrow" },
  { key: "attackGlow" },
  { key: "compactOwnBoard" },
  { key: "previewBigCard", invert: true },
  { key: "previewPopup" },
  { key: "donUpright" },
  { key: "totalPower" },
  { key: "shortcutTags" },
  { key: "oppHandTopRight" },
  { key: "tiltedBoard" },
  { key: "bigBoard" },
  { key: "actionsBeside" },
  { key: "turnSplash" },
  { key: "gameHints" },
  { key: "reduceMotion" },
  { key: "turnAlert" },
  { key: "turnSound" },
  { key: "spectatorSound" },
  { key: "quietWatchTabs" },
];

const TOGGLES: Toggle[] = TOGGLE_KEYS.map((t) => ({ ...t, label: ROW_TEXT[t.key].label, hint: ROW_TEXT[t.key].hint }));

type ShowToggle = { key: ShowKey; label: string; hint: string };

const SHOW_TOGGLES: ShowToggle[] = [
  {
    key: "showCardPreview",
    label: "Card preview",
    hint: "The hovered card's art and text, at the top of the left column.",
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

// Chips can wrap to two rows on narrow windows, so the margin that clears them is measured from the row itself.
function jumpToGroup(id: GroupId) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const group = document.getElementById(`gp-${id}`);
  if (!group) return;
  const nav = group.closest(".sheet")?.querySelector<HTMLElement>(".settings-group-jump");
  if (nav) group.style.scrollMarginTop = `${nav.offsetHeight + 8}px`;
  group.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
}

/** What this window and pointer can show, which decides the rows that appear. */
export function useFieldDevice(): FieldDevice {
  // Phones and tall windows keep the flat board, so the switch would do nothing there.
  const tiltFits = useMediaQuery(TILT_BOARD_QUERY);
  const desktop = useMediaQuery(DESKTOP_BOARD_QUERY);
  const finePointer = useMediaQuery(FINE_POINTER_QUERY);
  const portrait = useMediaQuery(PORTRAIT_MAT_QUERY);
  const sidewaysFan = useMediaQuery(SIDEWAYS_FAN_QUERY);
  return { desktop, tiltFits, finePointer, portrait, sidewaysFan };
}

/**
 * `query` (the Settings page search) keeps only the rows whose text matches; the in-match sheet passes none.
 * `deviceNote` adds the muted line about options this device hides.
 */
export function GameplaySettingsFields({
  spectating = false,
  query = "",
  deviceNote = false,
}: { spectating?: boolean; query?: string; deviceNote?: boolean } = {}) {
  const settings = useDuelSettings();
  const lockNote = useLockNote(settings.screenOrientation);
  const device = useFieldDevice();
  const { desktop, portrait, sidewaysFan } = device;
  const noteFor = (key: RowKey) => rowDisabledNote(key, device, settings);
  const disabledNote = (note: string | null) =>
    note ? (
      <p className="field-hint field-note" role="note">
        {note}
      </p>
    ) : null;
  const groups = filterGroupsByQuery(visibleGroups(device, undefined, { spectating }), query, rowSearchText);
  const deviceHint = deviceNote && !query.trim() ? hiddenRowsNote(device) : null;
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
                t.key === "oppHandTopRight"
                  ? settings.oppHandSpot === "right"
                  : t.invert
                    ? !settings[t.key]
                    : settings[t.key]
              }
              disabled={note !== null}
              onChange={(e) => {
                if (t.key === "oppHandTopRight") {
                  updateSettings({ oppHandSpot: e.target.checked ? "right" : "" });
                  return;
                }
                updateSettings({ [t.key]: t.invert ? !e.target.checked : e.target.checked });
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
            <label htmlFor="end-turn-confirm">{ROW_TEXT.endTurnConfirm.label}</label>
            <Select
              id="end-turn-confirm"
              value={settings.endTurnConfirm}
              onChange={(v) => updateSettings({ endTurnConfirm: v })}
              options={END_TURN_OPTIONS}
            />
            <p className="field-hint">{ROW_TEXT.endTurnConfirm.hint}</p>
          </div>

        );
      case "responseStops":
        return (
          <div className="field">
            <label htmlFor="response-stops">{ROW_TEXT.responseStops.label}</label>
            <Select
              id="response-stops"
              value={settings.responseStops}
              onChange={(v) => updateSettings({ responseStops: v })}
              options={RESPONSE_STOP_OPTIONS}
            />
            <p className="field-hint">{ROW_TEXT.responseStops.hint}</p>
          </div>

        );
      case "screenOrientation":
        return (
          <div className="field">
            <label htmlFor="screen-orientation">{ROW_TEXT.screenOrientation.label}</label>
            <Select
              id="screen-orientation"
              value={settings.screenOrientation}
              onChange={(v) => updateSettings({ screenOrientation: v })}
              options={ORIENTATION_OPTIONS}
            />
            <p className="field-hint">{ROW_TEXT.screenOrientation.hint}</p>
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
            <label htmlFor="hand-layout">{ROW_TEXT.handLayout.label}</label>
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
                : !portrait && sidewaysFan
                  ? "Held sideways, Fan tucks under the board; Automatic and Grid keep your hand in the right column."
                  : "Fan overlaps the cards so they all fit; Grid lays them out and scrolls."}
            </p>
            {disabledNote(noteFor("handLayout"))}
          </div>

        );
      case "sidePanels":
        return (
          <div className="field">
            <span className="field-label" id="side-panels-label">{ROW_TEXT.sidePanels.label}</span>
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
            <p className="field-hint">{ROW_TEXT.sidePanels.hint}</p>
          </div>

        );
      case "sideColumns":
        return (
          <div className="field">
            <label htmlFor="side-columns">{ROW_TEXT.sideColumns.label}</label>
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
            <p className="field-hint">{ROW_TEXT.sideColumns.hint}</p>
          </div>

        );
      case "oppHandSpot":
        return (
          <div className="field">
            <label htmlFor="opp-hand-spot">{ROW_TEXT.oppHandSpot.label}</label>
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
            <p className="field-hint">{ROW_TEXT.oppHandSpot.hint}</p>
          </div>

        );
      case "textSize":
        return (
          <div className="field">
            <label htmlFor="text-size">{ROW_TEXT.textSize.label}</label>
            <Select
              id="text-size"
              value={settings.textSize}
              onChange={(v) => updateSettings({ textSize: v })}
              options={TEXT_SIZE_OPTIONS}
            />
            <p className="field-hint">{ROW_TEXT.textSize.hint}</p>
          </div>

        );
      case "lifeFan":
        return (
          <div className="field">
            <label htmlFor="life-fan">{ROW_TEXT.lifeFan.label}</label>
            <Select
              id="life-fan"
              disabled={noteFor("lifeFan") !== null}
              value={settings.lifeFan}
              onChange={(v) => updateSettings({ lifeFan: v })}
              options={LIFE_FAN_OPTIONS}
            />
            <p className="field-hint">{ROW_TEXT.lifeFan.hint}</p>
            {disabledNote(noteFor("lifeFan"))}
          </div>
        );
      case "animationSpeed":
        return (
          <div className="field">
            <label htmlFor="animation-speed">{ROW_TEXT.animationSpeed.label}</label>
            <Select
              id="animation-speed"
              value={settings.animationSpeed}
              onChange={(v) => updateSettings({ animationSpeed: v })}
              options={ANIMATION_OPTIONS}
            />
            <p className="field-hint">{ROW_TEXT.animationSpeed.hint}</p>
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
              <span>{ROW_TEXT.cardSpotlight.label}</span>
            </label>
            <p className="field-hint">{ROW_TEXT.cardSpotlight.hint}</p>
          </div>

        );
      case "popupSize":
        return (
          <div className="field">
            <label htmlFor="popup-size">{ROW_TEXT.popupSize.label} · {settings.popupSize}%</label>
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
            <p className="field-hint">{ROW_TEXT.popupSize.hint}</p>
          </div>
        );
      case "previewPopupSize":
        return (
          <div className="field">
            <label htmlFor="preview-popup-size">{ROW_TEXT.previewPopupSize.label} · {settings.previewPopupSize}%</label>
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
            <p className="field-hint">{ROW_TEXT.previewPopupSize.hint}</p>
          </div>
        );
      case "showOnScreen":
        return (
          <div className="field gameplay-group" role="group" aria-labelledby="show-on-screen-label">
            <span className="field-label" id="show-on-screen-label">{ROW_TEXT.showOnScreen.label}</span>
            <p className="field-hint">{ROW_TEXT.showOnScreen.hint}</p>
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
      {spectating ? (
        <p className="field-hint">
          Settings for playing your own turns are hidden while you watch. Change them from Settings.
        </p>
      ) : null}
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
      {deviceHint ? <p className="field-hint gameplay-device-note">{deviceHint}</p> : null}
    </div>
  );
}

export function GameplaySettingsSheet({ onClose, spectating = false }: { onClose: () => void; spectating?: boolean }) {
  return (
    <Dialog open onClose={onClose} className="sheet-backdrop" panelClassName="sheet" label="Gameplay settings">
      <div className="sheet-head">
        <span className="icon-btn-spacer" aria-hidden />
        <h2 className="sheet-title">Gameplay</h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </div>
      <GameplaySettingsFields spectating={spectating} />
    </Dialog>
  );
}
