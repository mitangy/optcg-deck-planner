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

/** Colour family; reuses the existing chip palette (see .status-chip-* in styles.css). */
export type StatusTone = "default" | "danger" | "negated" | "sick" | "stun" | "lock";

export type StatusIconSpec = { glyph: StatusGlyph; tone: StatusTone };

const NEGATED: StatusIconSpec = { glyph: "negated", tone: "negated" };
const STUN: StatusIconSpec = { glyph: "star", tone: "stun" };

const TABLE = new Map<string, StatusIconSpec>([
  ["effects negated", NEGATED],
  ["nullified", NEGATED],
  ["cannot attack", { glyph: "no-attack", tone: "danger" }],
  ["summoning sick", { glyph: "sleep", tone: "sick" }],
  ["blocker", { glyph: "shield", tone: "default" }],
  ["unblockable", { glyph: "unblockable", tone: "danger" }],
  ["rush", { glyph: "bolt", tone: "danger" }],
  ["rush: character", { glyph: "bolt-character", tone: "danger" }],
  ["double attack", { glyph: "double", tone: "danger" }],
  ["banish", { glyph: "banish", tone: "default" }],
  ["won't refresh", { glyph: "no-refresh", tone: "lock" }],
  ["stun", STUN],
  ["stunned", STUN],
  ["unrestable", { glyph: "lock", tone: "lock" }],
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
  return hit ?? null;
}
