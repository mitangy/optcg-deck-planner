import { hasUnconditionalKeyword } from "../registry/searchSlice.js";
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
 * - keyword — a complete, unconditional Blocker / Rush keyword
 * - stub — printed text is stored for inspect; no resolution yet
 */
import { isCuratedCardDef, listCardDefs } from "./definitions.js";
import { listCatalogMetaIds } from "./catalogMeta.js";
import type { CardDef } from "../types.js";

export type EffectTiming =
  | "activate_main"
  | "on_play"
  | "on_ko"
  | "when_attacking"
  | "opponent_turn"
  | "your_turn"
  | "turn_start"
  | "turn_end"
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
  /** Stable within one card definition; suitable for coverage reports/tests. */
  abilityId: string;
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
  {
    re: /\[On Your Opponent'?s Attack\]|\[On Opponent'?s Attack\]/i,
    timing: "on_opp_attack",
  },
  { re: /\[Opponent'?s Turn\]/i, timing: "opponent_turn" },
  { re: /\[Your Turn\]/i, timing: "your_turn" },
  { re: /\[(?:At the )?Start of Your Turn\]/i, timing: "turn_start" },
  { re: /\[(?:At the )?End of Your Turn\]/i, timing: "turn_end" },
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

function timingsForClause(clause: string): EffectTiming[] {
  // Only tags in the leading timing prefix identify this clause. A card name,
  // keyword reference, or "activate this card's [Main]" in the body does not.
  const prefix = clause.match(/^(?:\s*\[[^\]]+\]\s*\/?\s*)+/)?.[0] ?? "";
  const timings = TAG_PATTERNS
    .filter(({ re }) => re.test(prefix))
    .map(({ timing }) => timing);
  return timings.length > 0 ? [...new Set(timings)] : [clause.startsWith("[") ? "other" : "static"];
}

type ExplicitCoverage = { status: EffectStatus; hook?: string };

/**
 * Reviewed engine coverage. Absence means stub. This intentionally does not
 * infer support from a similarly named field or a `hasTrigger` marker.
 */
const EXPLICIT_COVERAGE: Readonly<Record<string, ExplicitCoverage>> = {
  "ST01-001:activate_main": { status: "implemented", hook: "leaderActivateGiveRestedDon" },
  "ST01-006:blocker": { status: "keyword", hook: "abilityRegistry" },
  "ST01-004:other": { status: "implemented", hook: "abilityRegistry" },
  "ST01-005:when_attacking": { status: "implemented", hook: "abilityRegistry" },
  "ST01-014:counter": { status: "implemented", hook: "counterFriendlyPower" },
  "ST01-014:trigger": { status: "implemented", hook: "triggerFriendlyPowerBonus" },
  "OP17-001:on_opp_attack": { status: "implemented", hook: "leaderOnOppAttackTrashForPower" },
  "OP16-080:on_opp_attack": { status: "implemented", hook: "leaderOnOppAttackTrashTriggerRetarget" },
  "OP16-080:opponent_turn": { status: "implemented", hook: "abilityRegistry" },
  "OP17-039:when_attacking": { status: "implemented", hook: "leaderWhenAttackingTrashRevealDraw" },
  "OP17-002:opponent_turn": { status: "implemented", hook: "abilityRegistry" },
  "OP17-003:rush": { status: "implemented", hook: "abilityRegistry" },
  "OP17-003:on_play": { status: "implemented", hook: "abilityRegistry" },
  "OP17-005:static": { status: "implemented", hook: "abilityRegistry" },
  "OP17-005:on_play": { status: "implemented", hook: "abilityRegistry" },
  "OP17-008:on_play": { status: "implemented", hook: "abilityRegistry" },
  "OP17-015:static": { status: "implemented", hook: "removalReplacementSelfKo" },
  "OP17-015:on_ko": { status: "implemented", hook: "onKoReviveSelf" },
  "OP16-118:on_play": { status: "implemented", hook: "onPlaySearchTop" },
  "OP16-118:static": { status: "implemented", hook: "abilityRegistry" },
  "OP16-118:on_ko": { status: "implemented", hook: "onKoSearchTop" },
  "ST23-001:static": { status: "implemented", hook: "abilityRegistry" },
  "OP09-118:rush": { status: "keyword", hook: "abilityRegistry" },
  "OP09-118:static": { status: "implemented", hook: "rogerBlockerWin" },
  "OP16-021:activate_main": { status: "implemented", hook: "abilityRegistry" },
  "OP16-021:on_play": { status: "implemented", hook: "abilityRegistry" },
  "ST23-001:blocker": { status: "keyword", hook: "abilityRegistry" },
  "EB04-058:blocker": { status: "keyword", hook: "abilityRegistry" },
  "EB04-058:on_play": { status: "implemented", hook: "onPlayLowLifeAddLife" },
  "EB03-034:on_play": { status: "implemented", hook: "onPlayDrawHandToDeckDon" },
  "EB03-034:on_ko": { status: "implemented", hook: "onKoReturnDonAddLife" },
  "OP17-112:on_play": { status: "implemented", hook: "onPlayDrawThenLifeChoice" },
  "OP17-112:your_turn": { status: "implemented", hook: "abilityRegistry" },
  "OP09-093:blocker": { status: "keyword", hook: "abilityRegistry" },
  "OP09-093:activate_main": { status: "implemented", hook: "activateMainNegateOpponent" },
  "OP09-095:activate_main": { status: "implemented", hook: "abilityRegistry" },
  "OP09-086:static": { status: "implemented", hook: "abilityRegistry" },
  "OP09-099:activate_main": { status: "implemented", hook: "abilityRegistry" },
  "OP09-096:main": { status: "implemented", hook: "abilityRegistry" },
  "OP09-096:trigger": { status: "implemented", hook: "abilityRegistry" },
  "OP17-019:main": { status: "implemented", hook: "mainSearchTop" },
  "OP17-019:trigger": { status: "implemented", hook: "triggerLeaderPowerBonus" },
  "OP12-112:trigger": { status: "implemented", hook: "abilityRegistry" },
  "OP16-108:trigger": { status: "implemented", hook: "abilityRegistry" },
  "OP16-108:on_play": { status: "implemented", hook: "onPlayTrashHandToLife" },
  "OP16-106:trigger": { status: "implemented", hook: "triggerActivateOnKo" },
  "OP16-106:on_ko": { status: "implemented", hook: "onKoDraw + onKoLeaderBasePower" },
  "OP16-109:trigger": { status: "implemented", hook: "triggerActivateOnKo" },
  "OP16-109:on_ko": { status: "implemented", hook: "onKoDraw + onKoOpponentKoCost" },
  "OP16-110:trigger": { status: "implemented", hook: "triggerActivateOnKo" },
  "OP16-110:on_ko": { status: "implemented", hook: "onKoDraw + onKoOpponentRestCost" },
  "OP16-116:trigger": { status: "implemented", hook: "triggerDrawThenTrash" },
  "OP16-116:main": { status: "implemented", hook: "mainPlayNamedThenOpponentLife" },
  "ST30-004:on_play": { status: "implemented", hook: "onPlayRevealDrawTrash" },
  "OP16-115:main": { status: "implemented", hook: "mainTrashTriggerToHand" },
  "OP16-115:trigger": { status: "implemented", hook: "triggerNegateOpponent" },
  "OP16-119:on_play": { status: "implemented", hook: "onPlaySearchTop" },
  "OP16-119:trigger": { status: "implemented", hook: "triggerNegateOpponent" },
  "OP16-104:when_attacking": { status: "implemented", hook: "abilityRegistry" },
  "OP16-104:trigger": { status: "implemented", hook: "triggerDraw + triggerPlayTrashCharacter" },
  "OP14-108:on_play": { status: "implemented", hook: "abilityRegistry" },
  "OP14-108:trigger": { status: "implemented", hook: "triggerActivateOnPlay" },
  "OP12-018:counter": { status: "implemented", hook: "counterFriendlyPower + counterRestDonOpponentAllPenalty" },
  "OP17-017:counter": { status: "implemented", hook: "counterFriendlyPower + counterOpponentTargetPenalty" },
};

function statusFor(
  def: CardDef,
  timing: EffectTiming,
): { status: EffectStatus; hook?: string } {
  return EXPLICIT_COVERAGE[`${def.id}:${timing}`] ?? { status: "stub" };
}

/** Build catalog rows for one card definition from printed text + hooks. */
export function effectsForDef(def: CardDef): CardEffectEntry[] {
  const entries: CardEffectEntry[] = [];
  const text = def.effectText ?? "";
  const clauses = splitClauses(text);

  if (clauses.length === 0) {
    if (hasUnconditionalKeyword(def.id, "blocker")) {
      entries.push({
        abilityId: `${def.id.toLowerCase()}:blocker:1`,
        cardId: def.id,
        name: def.name,
        timing: "blocker",
        summary: "[Blocker]",
        status: "keyword",
        hook: "abilityRegistry",
      });
    }
    if (hasUnconditionalKeyword(def.id, "rush")) {
      entries.push({
        abilityId: `${def.id.toLowerCase()}:rush:1`,
        cardId: def.id,
        name: def.name,
        timing: "rush",
        summary: "[Rush]",
        status: "keyword",
        hook: "abilityRegistry",
      });
    }
    if (entries.length === 0) {
      entries.push({
        abilityId: `${def.id.toLowerCase()}:vanilla:1`,
        cardId: def.id,
        name: def.name,
        timing: "other",
        summary: "No printed effect (vanilla).",
        status: "implemented",
      });
    }
    return entries;
  }

  const ordinals = new Map<EffectTiming, number>();
  for (const clause of clauses) {
    for (const timing of timingsForClause(clause)) {
      const ordinal = (ordinals.get(timing) ?? 0) + 1;
      ordinals.set(timing, ordinal);
      const { status, hook } = statusFor(def, timing);
      entries.push({
        abilityId: `${def.id.toLowerCase()}:${timing}:${ordinal}`,
        cardId: def.id,
        name: def.name,
        timing,
        summary: clause,
        status,
        hook,
      });
    }
  }

  if (hasUnconditionalKeyword(def.id, "blocker") && !entries.some((e) => e.timing === "blocker")) {
    entries.push({
      abilityId: `${def.id.toLowerCase()}:blocker:1`,
      cardId: def.id,
      name: def.name,
      timing: "blocker",
      summary: "[Blocker]",
      status: "keyword",
      hook: "abilityRegistry",
    });
  }
  if (hasUnconditionalKeyword(def.id, "rush") && !entries.some((e) => e.timing === "rush")) {
    entries.push({
      abilityId: `${def.id.toLowerCase()}:rush:1`,
      cardId: def.id,
      name: def.name,
      timing: "rush",
      summary: "[Rush]",
      status: "keyword",
      hook: "abilityRegistry",
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

/**
 * Aggregate EFFECT_CATALOG statuses into a client-facing abilitySupport label.
 * Never invents resolution — stubs/partials stay non-ok.
 */
export type AbilitySupport =
  | "none"
  | "keywords"
  | "ok"
  | "partial"
  | "unverified"
  | "unsupported";

export function abilitySupportFromEntries(
  entries: readonly CardEffectEntry[],
): AbilitySupport {
  if (entries.length === 0) return "none";
  if (
    entries.length === 1 &&
    entries[0]!.status === "implemented" &&
    /no printed effect/i.test(entries[0]!.summary)
  ) {
    return "none";
  }
  const statuses = entries.map((e) => e.status);
  if (statuses.every((s) => s === "keyword")) return "keywords";
  if (statuses.every((s) => s === "stub")) return "unsupported";
  if (statuses.some((s) => s === "stub")) return "partial";
  if (statuses.some((s) => s === "partial")) return "partial";
  if (statuses.every((s) => s === "implemented" || s === "keyword")) {
    return statuses.every((s) => s === "keyword") ? "keywords" : "ok";
  }
  return "unsupported";
}

export function abilitySupportForDef(def: CardDef): AbilitySupport {
  if (!isCuratedCardDef(def.id)) return "unverified";
  return abilitySupportFromEntries(effectsForDef(def));
}

/** Every bundled catalog id receives an explicit card-level support state. */
export function buildCardSupportManifest(): Record<string, AbilitySupport> {
  const curated = new Map(listCardDefs().map((def) => [def.id, def]));
  return Object.fromEntries(
    listCatalogMetaIds().map((id) => {
      const def = curated.get(id);
      return [id, def ? abilitySupportForDef(def) : "unverified"];
    }),
  );
}

export function summarizeCardSupportManifest(): Record<AbilitySupport, number> {
  const totals: Record<AbilitySupport, number> = {
    none: 0,
    keywords: 0,
    ok: 0,
    partial: 0,
    unverified: 0,
    unsupported: 0,
  };
  for (const status of Object.values(buildCardSupportManifest())) totals[status] += 1;
  return totals;
}

export type CardSupportIssue = { cardId: string; support: AbilitySupport };

export function unsupportedCardsForDeck(deck: {
  leaderId: string;
  deck: readonly string[];
}): CardSupportIssue[] {
  const manifest = buildCardSupportManifest();
  const ids = [...new Set([deck.leaderId, ...deck.deck])];
  return ids.flatMap((cardId) => {
    const support = manifest[cardId] ?? "unverified";
    return support === "none" || support === "keywords" || support === "ok"
      ? []
      : [{ cardId, support }];
  });
}

/** Attach abilitySupport to each atlas entry from curated effect catalog rows. */
export function enrichAtlasAbilitySupport<
  T extends { abilitySupport?: AbilitySupport },
>(atlas: Record<string, T>): Record<string, T> {
  for (const id of Object.keys(atlas)) {
    const def = listCardDefs().find((d) => d.id === id);
    if (!def) continue;
    atlas[id] = {
      ...atlas[id],
      abilitySupport: abilitySupportForDef(def),
    };
  }
  return atlas;
}
