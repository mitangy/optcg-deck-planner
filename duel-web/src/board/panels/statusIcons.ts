// Board tiles are too narrow for words ("NULLI…"), so labels map to small glyphs.

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
  | "no-rest"
  | "star"
  | "lock";

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

const NO_REST: StatusEntry = {
  glyph: "no-rest",
  tone: "disable",
  text: "An effect stops it from being rested, so it can't attack or use [Blocker].",
};

const TABLE = new Map<string, StatusEntry>([
  ["effects negated", NEGATED],
  ["nullified", NEGATED],
  ["rested", { glyph: null, tone: "rested", text: "Turned sideways: it can't attack or block until its controller's next Refresh Phase untaps it." }],
  ["cannot attack", { glyph: "no-attack", tone: "disable", text: "An effect stops it from declaring attacks." }],
  ["can't attack", { glyph: "no-attack", tone: "disable", text: "An effect stops it from declaring attacks." }],
  ["cannot be rested", NO_REST],
  ["can't be rested", NO_REST],
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
  ["unrestable", { glyph: "lock", tone: "protect", text: "Your opponent's effects can't rest it." }],
]);

function normalize(label: string): string {
  return label
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s*:\s*/g, ": ")
    .replace(/\s+/g, " ")
    .trim();
}

export function statusGlyph(label: string): StatusIconSpec | null {
  const hit = TABLE.get(normalize(label));
  return hit?.glyph ? { glyph: hit.glyph, tone: hit.tone } : null;
}

export function statusTone(label: string): StatusTone {
  return TABLE.get(normalize(label))?.tone ?? "default";
}

export function statusTooltip(label: string): { title: string; text: string | null } {
  return { title: label, text: TABLE.get(normalize(label))?.text ?? null };
}

export function splitStatuses(
  labels: string[],
  fit: number | null,
): { shown: string[]; hidden: string[] } {
  if (fit == null || labels.length <= fit) return { shown: labels, hidden: [] };
  const keep = Math.max(0, fit - 1);
  return { shown: labels.slice(0, keep), hidden: labels.slice(keep) };
}

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
