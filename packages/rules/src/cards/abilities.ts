/**
 * Immutable ability registry: generated definitions (from official text) with
 * reviewed manual overrides taking precedence per card. Validated once at load.
 */
import generatedRaw from "./generated/abilities.json" with { type: "json" };
import { MANUAL_ABILITIES } from "./manualAbilities.js";
import { compileAbilityProgram, compileStandalone, type Program } from "../effects/compile.js";
import { EFFECT_SCHEMA_VERSION, type Ability, type CardAbilities, type Keyword } from "../effects/types.js";
import { validateCardAbilitiesRecord } from "../effects/validate.js";

export class RegistryValidationError extends Error {
  constructor(readonly diagnostics: string[]) {
    super(`Ability registry validation failed:\n${diagnostics.slice(0, 50).join("\n")}`);
    this.name = "RegistryValidationError";
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 0x01000193); }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") { Object.values(value).forEach(deepFreeze); Object.freeze(value); }
  return value;
}

export interface AbilityRegistry {
  contentHash: string;
  cards: ReadonlyMap<string, CardAbilities>;
  abilities: ReadonlyMap<string, { cardId: string; ability: Ability }>;
}

/** Build and validate a registry from raw records (exported for tests). */
export function buildAbilityRegistry(records: Record<string, unknown>): AbilityRegistry {
  const errors: string[] = [];
  const cards = new Map<string, CardAbilities>();
  const abilities = new Map<string, { cardId: string; ability: Ability }>();
  for (const [id, raw] of Object.entries(records)) {
    const diagnostics = validateCardAbilitiesRecord(raw, `cards[${id}]`);
    if (diagnostics.length) { errors.push(...diagnostics); continue; }
    const record = structuredClone(raw) as CardAbilities;
    if (record.id !== id) { errors.push(`cards[${id}].id: mismatched id ${record.id}`); continue; }
    for (const ability of record.abilities) {
      if (abilities.has(ability.id)) errors.push(`cards[${id}]: duplicate ability id ${ability.id}`);
      abilities.set(ability.id, { cardId: id, ability });
    }
    cards.set(id, deepFreeze(record));
  }
  if (errors.length) throw new RegistryValidationError(errors);
  const normalized = [...cards.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  return { contentHash: `fnv1a:${fnv1a(stableStringify(normalized))}`, cards, abilities };
}

const generated = generatedRaw as unknown as Record<string, CardAbilities>;
const merged: Record<string, unknown> = {};
for (const [id, record] of Object.entries(generated)) merged[id] = record;
const manualErrors: string[] = [];
for (const [id, record] of Object.entries(MANUAL_ABILITIES)) {
  if ("patch" in record) {
    // Each patch ability replaces the unsupported generated clause its `text` starts.
    const base = generated[id];
    if (!base) { manualErrors.push(`manual[${id}]: no generated record to patch`); continue; }
    const covered = new Set<string>();
    const added = record.patch.map((ability) => {
      const clause = base.unsupported.find((c) => c.startsWith(ability.text));
      if (!clause) { manualErrors.push(`manual[${id}]: "${ability.text}" matches no unsupported clause (stale patch?)`); return ability; }
      covered.add(clause);
      return { ...ability, text: clause };
    });
    for (const fragment of record.drop ?? []) {
      const clause = base.unsupported.find((c) => c.startsWith(fragment));
      if (!clause) manualErrors.push(`manual[${id}]: dropped fragment "${fragment}" matches no unsupported clause`);
      else covered.add(clause);
    }
    const unsupported = base.unsupported.filter((c) => !covered.has(c));
    const abilities = [...base.abilities, ...added];
    merged[id] = { ...base, origin: "manual", abilities, unsupported, status: unsupported.length ? (abilities.length ? "partial" : "unsupported") : "supported" };
    continue;
  }
  merged[id] = { id, schemaVersion: EFFECT_SCHEMA_VERSION, origin: "manual", unsupported: [], ...record, status: record.status ?? ((record.unsupported?.length ?? 0) > 0 ? "partial" : record.abilities.length ? "supported" : "vanilla") };
}
if (manualErrors.length) throw new RegistryValidationError(manualErrors);

export const ABILITY_REGISTRY: AbilityRegistry = buildAbilityRegistry(merged);
export const REGISTRY_HASH = ABILITY_REGISTRY.contentHash;

const EMPTY: readonly Ability[] = Object.freeze([]);

export function cardAbilities(cardId: string): CardAbilities | undefined {
  return ABILITY_REGISTRY.cards.get(cardId);
}

export function abilitiesFor(cardId: string): readonly Ability[] {
  return ABILITY_REGISTRY.cards.get(cardId)?.abilities ?? EMPTY;
}

export function abilityById(abilityId: string): { cardId: string; ability: Ability } | undefined {
  return ABILITY_REGISTRY.abilities.get(abilityId);
}

const programs = new Map<string, Program>();
/** Compiled program for an ability. Triggered abilities with costs ask before paying. */
export function programFor(abilityId: string): Program {
  const hit = programs.get(abilityId);
  if (hit) return hit;
  const entry = abilityById(abilityId);
  if (!entry) throw new Error(`Unknown ability ${abilityId}`);
  const program = compileAbility(entry.ability);
  programs.set(abilityId, program);
  return program;
}

/** The program the engine runs for an ability: triggered abilities with costs ask before paying, Activate: Main pays up front. */
export function compileAbility(ability: Ability): Program {
  return compileAbilityProgram(ability, { optionalCosts: ability.trigger !== "activate_main" });
}

/** Compiled "instead" body of a replacement ability. */
export function replacementProgramFor(abilityId: string): Program {
  const key = `${abilityId}#instead`;
  const hit = programs.get(key);
  if (hit) return hit;
  const entry = abilityById(abilityId);
  if (!entry?.ability.replacement) throw new Error(`Ability ${abilityId} is not a replacement`);
  const program = compileStandalone(key, entry.ability.replacement.instead);
  programs.set(key, program);
  return program;
}

/** Printed unconditional keyword (catalog display only; legality is dynamic). */
export function hasPrintedKeyword(cardId: string, keyword: Keyword): boolean {
  return abilitiesFor(cardId).some((a) => a.trigger === "static" && !a.don && !(a.conditions?.length) && (a.statics ?? []).some((s) => s.s === "keyword" && s.target === "self" && s.keyword === keyword));
}
