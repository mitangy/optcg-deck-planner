/**
 * Catalog of printed effects for every curated card definition.
 *
 * Leader-only hooks also live in `leaderAbilities.ts`; this file covers the
 * full curated set (leaders + characters + events + stages) and records whether
 * the engine actually resolves each printed timing.
 *
 * Status:
 * - implemented — engine hook matches printed text for this timing
 * - partial — some clauses run; others are display-only
 * - keyword — keyword flag only (Blocker / Rush / hasTrigger marker)
 * - stub — printed text is stored for inspect; no resolution yet
 */
import { listCardDefs } from "./definitions.js";
import type { CardDef } from "../types.js";

export type EffectTiming =
  | "activate_main"
  | "on_play"
  | "on_ko"
  | "when_attacking"
  | "opponent_turn"
  | "on_opp_attack"
  | "trigger"
  | "counter"
  | "main"
  | "blocker"
  | "rush"
  | "static"
  | "other";

export type EffectStatus = "implemented" | "partial" | "keyword" | "stub";

export type CardEffectEntry = {
  cardId: string;
  name: string;
  timing: EffectTiming;
  summary: string;
  status: EffectStatus;
  /** Engine field / keyword that implements this row, when applicable. */
  hook?: string;
};

const TAG_PATTERNS: { re: RegExp; timing: EffectTiming }[] = [
  { re: /\[Activate:\s*Main\]/i, timing: "activate_main" },
  { re: /\[On Play\]/i, timing: "on_play" },
  { re: /\[On K\.?O\.?\]/i, timing: "on_ko" },
  { re: /\[When Attacking\]/i, timing: "when_attacking" },
  { re: /\[Opponent'?s Turn\]/i, timing: "opponent_turn" },
  {
    re: /\[On Your Opponent'?s Attack\]|\[On Opponent'?s Attack\]/i,
    timing: "on_opp_attack",
  },
  { re: /\[Trigger\]/i, timing: "trigger" },
  { re: /\[Counter\]/i, timing: "counter" },
  { re: /\[Main\]/i, timing: "main" },
  { re: /\[Blocker\]/i, timing: "blocker" },
  { re: /\[Rush(?::[^\]]*)?\]/i, timing: "rush" },
];

function splitClauses(text: string): string[] {
  const cleaned = text.replace(/\r/g, "").trim();
  if (!cleaned || cleaned === "—" || cleaned === "-") return [];
  const parts = cleaned
    .split(/\n{2,}/)
    .flatMap((p) => (p.includes("\n[") ? p.split(/\n(?=\[)/) : [p]))
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [cleaned.replace(/\s+/g, " ").trim()];
}

function timingForClause(clause: string): EffectTiming {
  for (const { re, timing } of TAG_PATTERNS) {
    if (re.test(clause)) return timing;
  }
  return clause.startsWith("[") ? "other" : "static";
}

function statusFor(
  def: CardDef,
  timing: EffectTiming,
  clause: string,
): { status: EffectStatus; hook?: string } {
  if (timing === "blocker" && def.blocker) {
    return { status: "keyword", hook: "blocker" };
  }
  if (timing === "rush" && def.rush) {
    return { status: "keyword", hook: "rush" };
  }
  if (timing === "activate_main" && def.leaderActivateGiveRestedDon) {
    return { status: "implemented", hook: "leaderActivateGiveRestedDon" };
  }
  if (timing === "opponent_turn" && def.leaderOpponentCharacterCostBonus) {
    return { status: "implemented", hook: "leaderOpponentCharacterCostBonus" };
  }
  if (timing === "on_opp_attack" && def.leaderOnOppAttackTrashForPower) {
    return { status: "implemented", hook: "leaderOnOppAttackTrashForPower" };
  }
  if (timing === "on_opp_attack" && def.leaderOnOppAttackTrashTriggerRetarget) {
    return {
      status: "implemented",
      hook: "leaderOnOppAttackTrashTriggerRetarget",
    };
  }
  if (timing === "when_attacking" && def.leaderWhenAttackingTrashRevealDraw) {
    return {
      status: "implemented",
      hook: "leaderWhenAttackingTrashRevealDraw",
    };
  }
  if (timing === "on_play" && def.onPlayOptionalDraw) {
    return { status: "implemented", hook: "onPlayOptionalDraw" };
  }
  if (
    timing === "on_play" &&
    (def.onPlayDraw ||
      def.onPlayLowLifeAddLife ||
      def.onPlayDrawThenLifeChoice ||
      def.onPlayDrawHandToDeckDon)
  ) {
    return { status: "implemented", hook: "onPlayHooks" };
  }
  if (timing === "counter" && def.counterPowerBonus) {
    if (/then/i.test(clause)) {
      return { status: "partial", hook: "counterPowerBonus" };
    }
    return { status: "implemented", hook: "counterPowerBonus" };
  }
  if (timing === "main" && def.mainDraw) {
    return { status: "implemented", hook: "mainDraw" };
  }
  if (timing === "trigger" && def.triggerDraw) {
    return { status: "implemented", hook: "triggerDraw" };
  }
  if (timing === "trigger" && def.hasTrigger) {
    return { status: "keyword", hook: "hasTrigger" };
  }
  return { status: "stub" };
}

/** Build catalog rows for one card definition from printed text + hooks. */
export function effectsForDef(def: CardDef): CardEffectEntry[] {
  const entries: CardEffectEntry[] = [];
  const text = def.effectText ?? "";
  const clauses = splitClauses(text);

  if (clauses.length === 0) {
    if (def.blocker) {
      entries.push({
        cardId: def.id,
        name: def.name,
        timing: "blocker",
        summary: "[Blocker]",
        status: "keyword",
        hook: "blocker",
      });
    }
    if (def.rush) {
      entries.push({
        cardId: def.id,
        name: def.name,
        timing: "rush",
        summary: "[Rush]",
        status: "keyword",
        hook: "rush",
      });
    }
    if (entries.length === 0) {
      entries.push({
        cardId: def.id,
        name: def.name,
        timing: "other",
        summary: "No printed effect (vanilla).",
        status: "implemented",
      });
    }
    return entries;
  }

  for (const clause of clauses) {
    const timing = timingForClause(clause);
    const { status, hook } = statusFor(def, timing, clause);
    entries.push({
      cardId: def.id,
      name: def.name,
      timing,
      summary: clause,
      status,
      hook,
    });
  }

  if (def.blocker && !entries.some((e) => e.timing === "blocker")) {
    entries.push({
      cardId: def.id,
      name: def.name,
      timing: "blocker",
      summary: "[Blocker]",
      status: "keyword",
      hook: "blocker",
    });
  }
  if (def.rush && !entries.some((e) => e.timing === "rush")) {
    entries.push({
      cardId: def.id,
      name: def.name,
      timing: "rush",
      summary: "[Rush]",
      status: "keyword",
      hook: "rush",
    });
  }

  return entries;
}

/** Full curated-card effect catalog (recomputed from definitions). */
export function buildEffectCatalog(): CardEffectEntry[] {
  return listCardDefs().flatMap(effectsForDef);
}

/** Snapshot used by docs/tests — frozen at module load for stable imports. */
export const EFFECT_CATALOG: readonly CardEffectEntry[] = buildEffectCatalog();

export function effectsForCard(cardId: string): CardEffectEntry[] {
  return EFFECT_CATALOG.filter((e) => e.cardId === cardId);
}

export function summarizeEffectCoverage(): {
  total: number;
  implemented: number;
  partial: number;
  keyword: number;
  stub: number;
} {
  const rows = EFFECT_CATALOG;
  const count = (s: EffectStatus) => rows.filter((r) => r.status === s).length;
  return {
    total: rows.length,
    implemented: count("implemented"),
    partial: count("partial"),
    keyword: count("keyword"),
    stub: count("stub"),
  };
}
