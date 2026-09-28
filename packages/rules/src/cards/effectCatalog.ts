/**
 * Card support manifest derived from the ability registry. A card is "ok"
 * only when every printed clause maps to executable DSL; display text alone
 * never establishes support.
 */
import { abilitiesFor, cardAbilities } from "./abilities.js";
import { getCardDef, hasCardDef, listCardDefs } from "./definitions.js";
import type { Ability } from "../effects/types.js";

export type AbilitySupport = "none" | "keywords" | "ok" | "partial" | "unverified" | "unsupported";

export interface CardEffectEntry {
  abilityId: string;
  cardId: string;
  name: string;
  timing: Ability["trigger"];
  summary: string;
  status: "implemented" | "unsupported";
}

function keywordOnly(abilities: readonly Ability[]): boolean {
  return abilities.length > 0 && abilities.every((a) => a.trigger === "static" && !a.don && !a.conditions?.length && (a.statics ?? []).every((s) => s.s === "keyword" && s.target === "self"));
}

export function abilitySupportForCard(cardId: string): AbilitySupport {
  if (!hasCardDef(cardId)) return "unverified";
  const def = getCardDef(cardId);
  if (def.dataSource === "stub") return "unverified";
  const record = cardAbilities(def.id);
  if (!record) return "unverified";
  switch (record.status) {
    case "vanilla": return def.dataSource === "bandai" ? "none" : "unverified";
    case "supported": return keywordOnly(record.abilities) ? "keywords" : "ok";
    case "partial": return "partial";
    case "unsupported": return "unsupported";
  }
}

/** @deprecated Use abilitySupportForCard. */
export function abilitySupportForDef(def: { id: string }): AbilitySupport {
  return abilitySupportForCard(def.id);
}

export function effectsForCard(cardId: string): CardEffectEntry[] {
  const record = cardAbilities(cardId);
  if (!record) return [];
  const name = hasCardDef(cardId) ? getCardDef(cardId).name : cardId;
  return [
    ...record.abilities.map((a) => ({ abilityId: a.id, cardId, name, timing: a.trigger, summary: a.text, status: "implemented" as const })),
    ...record.unsupported.map((text, i) => ({ abilityId: `${cardId.toLowerCase()}#unsupported${i}`, cardId, name, timing: "static" as const, summary: text, status: "unsupported" as const })),
  ];
}

export function effectsForDef(def: { id: string }): CardEffectEntry[] {
  return effectsForCard(def.id);
}

export function buildEffectCatalog(): CardEffectEntry[] {
  return listCardDefs().flatMap((def) => effectsForCard(def.id));
}

/** Every catalog id receives an explicit card-level support state. */
export function buildCardSupportManifest(): Record<string, AbilitySupport> {
  return Object.fromEntries(listCardDefs().filter((d) => d.dataSource !== "stub").map((def) => [def.id, abilitySupportForCard(def.id)]));
}

export function summarizeCardSupportManifest(): Record<AbilitySupport, number> {
  const totals: Record<AbilitySupport, number> = { none: 0, keywords: 0, ok: 0, partial: 0, unverified: 0, unsupported: 0 };
  for (const status of Object.values(buildCardSupportManifest())) totals[status] += 1;
  return totals;
}

export function summarizeEffectCoverage(): { cards: number; abilities: number; unsupportedClauses: number; byStatus: Record<AbilitySupport, number> } {
  const defs = listCardDefs().filter((d) => d.dataSource !== "stub");
  return {
    cards: defs.length,
    abilities: defs.reduce((n, d) => n + abilitiesFor(d.id).length, 0),
    unsupportedClauses: defs.reduce((n, d) => n + (cardAbilities(d.id)?.unsupported.length ?? 0), 0),
    byStatus: summarizeCardSupportManifest(),
  };
}

export type CardSupportIssue = { cardId: string; support: AbilitySupport };

/** Cards that block ranked play: anything not fully executable or not verified. */
export function unsupportedCardsForDeck(deck: { leaderId: string; deck: readonly string[] }): CardSupportIssue[] {
  const ids = [...new Set([deck.leaderId, ...deck.deck].map((id) => id.trim().toUpperCase()))];
  return ids.flatMap((cardId) => {
    const support = abilitySupportForCard(cardId);
    return support === "none" || support === "keywords" || support === "ok" ? [] : [{ cardId, support }];
  });
}

/** Attach abilitySupport (and unsupported clause text) to atlas entries. */
export function enrichAtlasAbilitySupport<T extends { abilitySupport?: AbilitySupport; unsupportedText?: string[]; deckRules?: string[] }>(atlas: Record<string, T>): Record<string, T> {
  for (const id of Object.keys(atlas)) {
    const unsupported = cardAbilities(id)?.unsupported ?? [];
    // Leader deck-construction rules (see deckRules.ts) so clients can validate without the engine.
    const deckRules = abilitiesFor(id).flatMap((a) => (a.statics ?? []).flatMap((s) => (s.s === "deck_rule" && /^(max_cost|no_events_cost_ge|only_trait):/.test(s.rule) ? [s.rule] : [])));
    atlas[id] = { ...atlas[id]!, abilitySupport: abilitySupportForCard(id), ...(unsupported.length ? { unsupportedText: [...unsupported] } : {}), ...(deckRules.length ? { deckRules } : {}) };
  }
  return atlas;
}

export const EFFECT_CATALOG: readonly CardEffectEntry[] = buildEffectCatalog();
