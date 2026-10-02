/**
 * Icon badges for on-board status labels. Board tiles are far too narrow for
 * words ("NULLI…", "SUMM…"), so the labels the rules engine emits
 * (packages/rules/src/engine/views.ts cardView) map to small glyphs; anything
 * unknown keeps the text chip. Full labels stay in card inspect.
 */

export type StatusGlyph =
  | "negated"
  | "no-attack"
  | "sleep"
  | "shield"
  | "unblockable"
  | "bolt"
  | "bolt-character"
  | "double"
  | "banish"
  | "no-refresh"
  | "star"
  | "lock";

/**
 * Colour family, by what the status does to the card:
 * disable (red) takes an action away, negated (purple) switches effects off,
 * sick (amber) is the one-turn Summoning sickness, rested (slate) is turned
 * sideways, buff (green) is a keyword that helps it, protect (blue) is a lock
 * that keeps it safe. Unknown card-script labels stay "default" (gold).
 * Colours live in styles.css (.status-tone-*).
 */
export type StatusTone = "default" | "disable" | "negated" | "sick" | "rested" | "buff" | "protect";

export type StatusIconSpec = { glyph: StatusGlyph; tone: StatusTone };

type StatusEntry = { glyph: StatusGlyph | null; tone: StatusTone; text: string };

const NEGATED: StatusEntry = {
  glyph: "negated",
  tone: "negated",
  text: "Its card effects are turned off (it keeps its printed power and cost).",
};
const STUN: StatusEntry = {
  glyph: "star",
  tone: "disable",
  text: "Stunned by an effect: it can't act until the effect ends.",
};

const TABLE = new Map<string, StatusEntry>([
  ["effects negated", NEGATED],
  ["nullified", NEGATED],
  ["rested", { glyph: null, tone: "rested", text: "Turned sideways: it can't attack or block until its controller's next Refresh Phase untaps it." }],
  ["cannot attack", { glyph: "no-attack", tone: "disable", text: "An effect stops it from declaring attacks." }],
  ["can't attack", { glyph: "no-attack", tone: "disable", text: "An effect stops it from declaring attacks." }],
  ["cannot block", { glyph: null, tone: "disable", text: "An effect stops it from blocking." }],
  ["can't block", { glyph: null, tone: "disable", text: "An effect stops it from blocking." }],
  ["summoning sick", { glyph: "sleep", tone: "sick", text: "Played this turn: it can't attack until its controller's next turn (Rush skips this)." }],
  ["blocker", { glyph: "shield", tone: "buff", text: "[Blocker]: it can rest to take an attack aimed at another card." }],
  ["unblockable", { glyph: "unblockable", tone: "buff", text: "[Unblockable]: Blocker can't be activated against its attacks." }],
  ["rush", { glyph: "bolt", tone: "buff", text: "[Rush]: it can attack the turn it is played." }],
  ["rush: character", { glyph: "bolt-character", tone: "buff", text: "[Rush: Character]: it can attack Characters the turn it is played." }],
  ["double attack", { glyph: "double", tone: "buff", text: "[Double Attack]: a hit on a Leader deals 2 damage." }],
  ["banish", { glyph: "banish", tone: "buff", text: "[Banish]: cards it damages go to the trash and skip their Trigger." }],
  ["won't refresh", { glyph: "no-refresh", tone: "disable", text: "It stays rested through its controller's next Refresh Phase." }],
  ["stun", STUN],
  ["stunned", STUN],
  ["unrestable", { glyph: "lock", tone: "protect", text: "Opponent effects can't rest it." }],
]);

/** Engine labels are fixed strings, but card scripts add free-form ones, so match loosely. */
function normalize(label: string): string {
  return label
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s*:\s*/g, ": ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Icon for a status label, or null when it has none (render the text chip instead). */
export function statusGlyph(label: string): StatusIconSpec | null {
  const hit = TABLE.get(normalize(label));
  return hit?.glyph ? { glyph: hit.glyph, tone: hit.tone } : null;
}

/** Colour family for any status label (text chips, inspect, tooltips), "default" when unknown. */
export function statusTone(label: string): StatusTone {
  return TABLE.get(normalize(label))?.tone ?? "default";
}

/**
 * Tooltip / inspect text: "Label: what it does". Unknown labels (card scripts
 * add their own) just repeat the label, so nothing is hidden or invented.
 */
export function statusTooltip(label: string): { title: string; text: string | null } {
  return { title: label, text: TABLE.get(normalize(label))?.text ?? null };
}

/**
 * Tiles show statuses in one row. When only `fit` slots fit, the last slot
 * becomes a "+N" badge, so show `fit - 1` labels and count the rest.
 * `fit` null means not measured yet (or everything fits): show all.
 */
export function splitStatuses(
  labels: string[],
  fit: number | null,
): { shown: string[]; hidden: string[] } {
  if (fit == null || labels.length <= fit) return { shown: labels, hidden: [] };
  const keep = Math.max(0, fit - 1);
  return { shown: labels.slice(0, keep), hidden: labels.slice(keep) };
}

/**
 * Where a fixed tooltip goes: centred above its badge, flipped below when
 * there is no room above, and clamped inside the viewport (`pad` margin).
 * Boxes are in viewport pixels (getBoundingClientRect), so a tilted board's
 * projected badge works too.
 */
export function placeTip(
  anchor: { left: number; top: number; width: number; height: number },
  tip: { width: number; height: number },
  viewport: { width: number; height: number },
  pad = 8,
  gap = 6,
): { left: number; top: number } {
  const maxLeft = Math.max(pad, viewport.width - tip.width - pad);
  const left = Math.min(maxLeft, Math.max(pad, anchor.left + anchor.width / 2 - tip.width / 2));
  const above = anchor.top - gap - tip.height;
  const top = above >= pad ? above : anchor.top + anchor.height + gap;
  const maxTop = Math.max(pad, viewport.height - tip.height - pad);
  return { left, top: Math.min(maxTop, top) };
}
