import { validateCondition, validateCost, validateOperation, validateJson, freezeData, readonlyMap } from "./validation.js";
import { ABILITY_SCHEMA_VERSION, type CardAbilityProgram, type CardAbilityRecord, type CompiledAbilityRegistry } from "./schema.js";

export class RegistryValidationError extends Error {
  constructor(readonly diagnostics: string[]) { super(`Ability registry validation failed:\n${diagnostics.join("\n")}`); this.name = "RegistryValidationError"; }
}
const kinds = new Set(["activated", "triggered", "continuous", "replacement", "rule"]);
const zones = new Set(["leader", "character", "stage", "hand", "life", "trash"]);
const windows = new Set(["activate_main", "on_play", "main", "life_trigger", "on_ko", "when_attacking", "while_active"]);
function object(value: unknown): Record<string, unknown> | null { return value != null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }

function validateProgram(raw: unknown, path: string, errors: string[]): CardAbilityProgram | null {
  const errorStart = errors.length;
  const value = object(raw);
  if (!value) { errors.push(`${path}: expected object`); return null; }
  const allowed = new Set(["schemaVersion", "id", "kind", "zones", "windows", "conditions", "costs", "operations", "implementation", "testRefs"]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`${path}.${key}: unknown field`);
  if (value.schemaVersion !== ABILITY_SCHEMA_VERSION) errors.push(`${path}.schemaVersion: expected ${ABILITY_SCHEMA_VERSION}`);
  if (typeof value.id !== "string" || value.id.length === 0) errors.push(`${path}.id: expected non-empty string`);
  if (!kinds.has(String(value.kind))) errors.push(`${path}.kind: unknown kind ${String(value.kind)}`);
  if (!Array.isArray(value.zones) || value.zones.length === 0 || value.zones.some((entry) => !zones.has(String(entry)))) errors.push(`${path}.zones: contains an unknown or missing zone`);
  if (!Array.isArray(value.windows) || value.windows.length === 0 || value.windows.some((entry) => !windows.has(String(entry)))) errors.push(`${path}.windows: contains an unknown or missing window`);
  if (!Array.isArray(value.conditions)) errors.push(`${path}.conditions: expected array`);
  else value.conditions.forEach((entry, index) => validateCondition(entry, `${path}.conditions[${index}]`, errors));
  if (!Array.isArray(value.costs)) errors.push(`${path}.costs: expected array`);
  else value.costs.forEach((entry, index) => validateCost(entry, `${path}.costs[${index}]`, errors));
  if (!Array.isArray(value.operations) || value.operations.length === 0) errors.push(`${path}.operations: expected non-empty array`);
  else value.operations.forEach((entry, index) => { validateOperation(entry, `${path}.operations[${index}]`, errors); const op = object(entry); if (op?.type === "search_top_deck" && Number(op.maxSelect) > Number(op.count)) errors.push(`${path}.operations[${index}].maxSelect: must not exceed count`); });
  if (!new Set(["implemented", "partial", "unsupported"]).has(String(value.implementation))) errors.push(`${path}.implementation: unknown status`);
  if (!Array.isArray(value.testRefs) || value.testRefs.some((entry) => typeof entry !== "string")) errors.push(`${path}.testRefs: expected string array`);
  return errors.length === errorStart ? value as unknown as CardAbilityProgram : null;
}
function stableStringify(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`; if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`; return JSON.stringify(value); }
function fnv1a(value: string): string { let hash = 0x811c9dc5; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 0x01000193); } return (hash >>> 0).toString(16).padStart(8, "0"); }

export function compileAbilityRegistry(input: unknown): CompiledAbilityRegistry {
  const errors: string[] = [];
  if (!Array.isArray(input)) throw new RegistryValidationError(["registry: expected an array"]);
  validateJson(input, "registry", errors);
  if (errors.length) throw new RegistryValidationError(errors);
  input = structuredClone(input);
  const records = input as unknown[];
  const cards = new Map<string, Readonly<CardAbilityRecord>>();
  const abilities = new Map<string, Readonly<CardAbilityProgram>>();
  records.forEach((raw, cardIndex) => { const record = object(raw); const path = `cards[${cardIndex}]`; if (!record || typeof record.cardDefId !== "string" || !record.cardDefId) { errors.push(`${path}.cardDefId: expected non-empty string`); return; } if (cards.has(record.cardDefId)) errors.push(`${path}.cardDefId: duplicate card ${record.cardDefId}`); if (!Array.isArray(record.abilities)) { errors.push(`${path}.abilities: expected array`); return; } const programs = record.abilities.map((program, abilityIndex) => validateProgram(program, `${path}(${record.cardDefId}).abilities[${abilityIndex}]`, errors)).filter((program): program is CardAbilityProgram => program != null); programs.forEach((program, abilityIndex) => { if (abilities.has(program.id)) errors.push(`${path}.abilities[${abilityIndex}].id: duplicate ability ${program.id}`); abilities.set(program.id, freezeData(program)); }); cards.set(record.cardDefId, Object.freeze({ cardDefId: record.cardDefId, abilities: Object.freeze(programs.slice()) })); });
  for (const [id, ability] of abilities) for (const [index, operation] of ability.operations.entries()) if (operation.type === "invoke_ability" && !abilities.has(operation.abilityId)) errors.push(`ability ${id}.operations[${index}].abilityId: unknown ability ${operation.abilityId}`);
  for (const [id, ability] of abilities) {
    if (ability.kind === "activated" && !ability.windows.includes("activate_main")) errors.push(`ability ${id}: activated abilities require an activate_main window`);
    if (ability.kind === "continuous" && ability.costs.length > 0) errors.push(`ability ${id}: continuous abilities cannot have activation costs`);
    if (ability.kind === "continuous" && (ability.windows.length !== 1 || ability.windows[0] !== "while_active")) errors.push(`ability ${id}: continuous abilities require only while_active`);
    if (ability.kind !== "continuous" && ability.windows.includes("while_active")) errors.push(`ability ${id}: while_active requires a continuous ability`);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) { errors.push(`ability ${id}: recursive invoke_ability cycle`); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const operation of abilities.get(id)?.operations ?? []) if (operation.type === "invoke_ability" && abilities.has(operation.abilityId)) visit(operation.abilityId);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of abilities.keys()) visit(id);
  if (errors.length > 0) throw new RegistryValidationError(errors);
  const normalized = [...cards.values()].map((record) => ({ cardDefId: record.cardDefId, abilities: record.abilities })).sort((a, b) => a.cardDefId.localeCompare(b.cardDefId));
  return Object.freeze({ schemaVersion: ABILITY_SCHEMA_VERSION, contentHash: `fnv1a:${fnv1a(stableStringify(normalized))}`, cards: readonlyMap(cards), abilities: readonlyMap(abilities) });
}
