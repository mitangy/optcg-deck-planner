/**
 * Static lints over the compiled program of every ability, the same programs the engine runs
 * (`compileAbility`, `compileDelayed`, replacement bodies). Two bug classes the card audits kept finding:
 *
 *  1. unbound-read: an ability reads a variable that no step on any path to the read writes
 *     (OP08-096 read `_last` after a mill that bound nothing; OP11-088 read `_last` in an event trigger;
 *     ST22-001 read `_last` after a reveal cost; Koala OP09-103 read `_did` that nothing set).
 *  2. ungated-may-payoff: an "if you do / if they do not" payoff is gated on the bind of a `may` whose action is
 *     not a cost, so accepting and then paying partially (or not at all) still counts (#213, #515).
 *
 * Writes and reads are derived from the compiled instructions (`effects/compile.ts`) and the runtime
 * (`engine/runtime.ts`); the tables below name the runtime code each one mirrors.
 */
import { ABILITY_REGISTRY, type AbilityRegistry, compileAbility } from "../../cards/abilities.js";
import { compileDelayed, compileStandalone, delayedEffects, type Instr, type Program } from "../../effects/compile.js";
import type { Ability, CmpOp, Cond, GameEventKind } from "../../effects/types.js";

export type FindingKind = "unbound-read" | "ungated-may-payoff";

export interface LintFinding {
  kind: FindingKind;
  cardId: string;
  abilityId: string;
  /** Where in the ability: its effect, a delayed effect, a replacement body or a header that never has variables. */
  where: string;
  /** The variable involved. */
  name: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Runtime facts
// ---------------------------------------------------------------------------

/**
 * Whether `dispatchEvent` hands the event's card to the queued ability, which binds it as `_event`
 * (`startAbility(..., { _event })` in engine/procedure.ts). One entry per `GameEventKind`, so adding a kind forces a decision.
 * Every `dispatchEvent` site of a `true` kind passes `card:`; `programLint.test.ts` re-checks that against the source.
 * `self_ko` is queued by `performKo` without an event card.
 */
export const EVENT_CARRIES_CARD: Record<GameEventKind, boolean> = {
  character_ko: true,
  character_played: true,
  don_returned: false,
  self_rested: true,
  life_removed: true,
  event_activated: true,
  trigger_activated: true,
  attack_declared: true,
  card_trashed_from_hand: true,
  self_attacked: true,
  leader_damaged: false,
  character_removed_by_effect: true,
  character_returned: true,
  don_given: true,
  blocker_activated: true,
  battle_ko_opponent: true,
  life_to_hand: false,
  attack_damage: true,
  self_ko: false,
  card_drawn_by_effect: false,
  character_rested: true,
  character_left_field: true,
  leader_attacked: true,
  battle_ended_vs_character: true,
};

/**
 * Effects that run through `forEachTarget` (or `play`) in `execActInner` and so reset and fill `_affected`.
 * Notably not `to_life`, `activate`, `give_don`, `power`, ...: those never write it.
 */
const WRITES_AFFECTED: ReadonlySet<string> = new Set(["ko", "rest", "to_hand", "to_deck", "to_trash", "play"]);

/** Filter keys whose string value names a variable (`filterMatches` in engine/queries.ts reads `ctx.vars[...]`). */
const FILTER_VAR_KEYS = ["excludeVar", "inVar", "notColorsOfVar", "sameNameAsVar"] as const;
const VAR_CONDS: ReadonlySet<string> = new Set(["var_count", "var_all_match", "var_any_match"]);

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Every variable a piece of DSL data reads. `{ ref: "event_card" }` reads `_event`. */
export function readsOf(node: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(node)) { for (const item of node) readsOf(item, out); return out; }
  if (!node || typeof node !== "object") return out;
  const o = node as Record<string, unknown>;
  const name = o.name;
  if (typeof o.c === "string" && VAR_CONDS.has(o.c) && typeof name === "string") out.add(name);
  if (o.ref === "var" && typeof name === "string") out.add(name);
  if (o.ref === "event_card") out.add("_event");
  if ((o.of === "var" || o.of === "var_sum") && typeof name === "string") out.add(name);
  for (const key of FILTER_VAR_KEYS) if (typeof o[key] === "string") out.add(o[key] as string);
  for (const value of Object.values(o)) readsOf(value, out);
  return out;
}

/** Keys that look like variable references but that `readsOf` does not know: a new DSL field the lint would miss. */
export function unknownVarKeys(node: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(node)) { for (const item of node) unknownVarKeys(item, out); return out; }
  if (!node || typeof node !== "object") return out;
  for (const [key, value] of Object.entries(node)) {
    if (/var/i.test(key) && !(FILTER_VAR_KEYS as readonly string[]).includes(key)) out.add(key);
    unknownVarKeys(value, out);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Definitions
// ---------------------------------------------------------------------------

/** One place that writes a variable. Only `may`/confirm definitions matter to the payoff lint. */
type Def = { kind: "confirm"; hasCosts: boolean; label: string } | { kind: "other" };
type Defs = Map<string, Set<Def>>;

const OTHER: Def = { kind: "other" };
const cloneDefs = (defs: Defs): Defs => new Map([...defs].map(([k, v]) => [k, new Set(v)]));
function mergeInto(into: Defs, from: Defs): void {
  for (const [name, set] of from) {
    const have = into.get(name);
    if (have) for (const d of set) have.add(d); else into.set(name, new Set(set));
  }
}

/** Variables bound before the first instruction. */
function initialDefs(ability: Ability): Defs {
  const defs: Defs = new Map();
  const bind = (name: string, def: Def = OTHER) => { defs.set(name, new Set([def])); };
  if (ability.trigger === "on_event" && ability.eventTrigger) {
    const events = [ability.eventTrigger.event, ...(ability.eventTrigger.alsoEvents ?? []), ...(ability.eventTrigger.anyCauseEvents ?? [])];
    if (events.every((e) => EVENT_CARRIES_CARD[e])) bind("_event");
  }
  if (ability.trigger === "replacement") {
    // pushReplacementFrame: `_target`, `_last` = [target], `_parent` when a removal is being replaced.
    bind("_target"); bind("_last"); bind("_parent");
    // programOf puts a "use this replacement effect?" confirm (no costs) in front of an optional one.
    if (ability.replacement?.optional) bind("_did", { kind: "confirm", hasCosts: false, label: "optional replacement" });
  }
  return defs;
}

/** What one instruction writes, mirroring `exec` / `execActInner` / the look resolution in engine/runtime.ts. */
function writesOf(instr: Instr, defOf: () => Def): { name: string; def: Def; keepOld?: boolean }[] {
  switch (instr.op) {
    case "select": case "mode": return [{ name: instr.bind, def: OTHER }];
    case "confirm": return [{ name: instr.bind, def: defOf() }];
    // Picked cards are bound only when something was picked, so an old value can survive.
    case "look": return instr.picks.flatMap((pick) => (pick.bind ? [{ name: pick.bind, def: OTHER, keepOld: true }] : []));
    case "act": {
      const effect = instr.effect;
      if (WRITES_AFFECTED.has(effect.do)) return [{ name: "_affected", def: OTHER }];
      if ((effect.do === "mill" || effect.do === "reveal_top") && effect.bind) return [{ name: effect.bind, def: OTHER }];
      return [];
    }
    default: return [];
  }
}

// ---------------------------------------------------------------------------
// Three-valued condition evaluation, for "can this payoff run when the may did nothing?"
// ---------------------------------------------------------------------------

function compare(a: number, op: CmpOp, b: number): boolean {
  switch (op) {
    case "<=": return a <= b;
    case ">=": return a >= b;
    case "==": return a === b;
    case "<": return a < b;
    case ">": return a > b;
    case "!=": return a !== b;
  }
}

/**
 * Evaluate `cond` when the named variables hold the given number of cards and everything else is unknown.
 * `undefined` means it depends on something else.
 */
function evalWith(cond: Cond, counts: Readonly<Record<string, number>>): boolean | undefined {
  switch (cond.c) {
    case "var_count": {
      const n = counts[cond.name];
      return n === undefined || typeof cond.value !== "number" ? undefined : compare(n, cond.op, cond.value);
    }
    // Both need at least one matching card; with none they are false whatever the filter says.
    case "var_all_match": case "var_any_match": return counts[cond.name] === 0 ? false : undefined;
    case "not": { const v = evalWith(cond.cond, counts); return v === undefined ? undefined : !v; }
    case "and": {
      const vs = cond.conds.map((c) => evalWith(c, counts));
      return vs.includes(false) ? false : vs.every((v) => v === true) ? true : undefined;
    }
    case "or": {
      const vs = cond.conds.map((c) => evalWith(c, counts));
      return vs.includes(true) ? true : vs.every((v) => v === false) ? false : undefined;
    }
    default: return undefined;
  }
}

// ---------------------------------------------------------------------------
// Dataflow over one program
// ---------------------------------------------------------------------------

interface ProgramResult {
  findings: Omit<LintFinding, "cardId" | "abilityId">[];
  /** Variables bound when each `delay` instruction runs: the delayed effect starts with a copy of them. */
  delaySnapshots: Map<number, Defs>;
}

/** The `then` branch of the `jumpIfNot` at `index` contains only effects acting on `_affected` and has no `else`. */
function payoffOnlyActsOnAffected(instrs: Instr[], index: number): boolean {
  const jump = instrs[index] as Extract<Instr, { op: "jumpIfNot" }>;
  // With an `else`, the branch ends in the `jump` over it, which is not an `act` and fails the check below.
  for (let i = index + 1; i < jump.to; i += 1) {
    const instr = instrs[i]!;
    if (instr.op !== "act") return false;
    const target = (instr.effect as { target?: { ref?: string; name?: string } }).target;
    if (target?.ref !== "var" || target.name !== "_affected") return false;
  }
  return jump.to > index + 1;
}

function lintProgram(program: Program, initial: Defs, where: string): ProgramResult {
  const { instrs } = program;
  const findings: ProgramResult["findings"] = [];
  const delaySnapshots = new Map<number, Defs>();
  // State before each instruction (and one past the end); all jumps go forward, so one ordered pass sees every path.
  const before: (Defs | undefined)[] = new Array(instrs.length + 1);
  before[0] = initial;
  const flow = (to: number, defs: Defs) => {
    if (to < 0 || to > instrs.length) throw new Error(`${program.abilityId}: jump target ${to} out of range`);
    const have = before[to];
    if (have) mergeInto(have, defs); else before[to] = cloneDefs(defs);
  };
  for (let i = 0; i < instrs.length; i += 1) {
    const defs = before[i];
    if (!defs) continue;
    const instr = instrs[i]!;
    if (instr.op === "jump" && instr.to <= i) throw new Error(`${program.abilityId}: backward jump at ${i}`);
    // Reads happen before this instruction's own writes.
    for (const name of readsOf(instr)) {
      if (!defs.has(name)) findings.push({ kind: "unbound-read", where, name, reason: `reads ${name}, which no earlier step writes (${describe(instr)})` });
    }
    if (instr.op === "jumpIfNot") lintGate(instrs, i, instr.cond, defs, where, findings);
    if (instr.op === "delay") delaySnapshots.set(instr.index, cloneDefs(defs));
    const out = cloneDefs(defs);
    const confirmDef: Def = { kind: "confirm", hasCosts: instr.op === "confirm" && Boolean(instr.costs?.length), label: describe(instr) };
    for (const { name, def, keepOld } of writesOf(instr, () => confirmDef)) {
      const set = keepOld ? (out.get(name) ?? new Set<Def>()) : new Set<Def>();
      set.add(def);
      out.set(name, set);
    }
    if (instr.op === "jump") flow(instr.to, out);
    else if (instr.op === "jumpIfNot" || instr.op === "jumpIfFalse" || instr.op === "jumpIfModeNot") { flow(instr.to, out); flow(i + 1, out); }
    else flow(i + 1, out);
  }
  return { findings, delaySnapshots };
}

function describe(instr: Instr): string {
  switch (instr.op) {
    case "act": return `do ${instr.effect.do}`;
    case "select": return `select ${instr.bind}`;
    case "confirm": return `may ${instr.bind}${instr.costs?.length ? " with costs" : " without costs"}`;
    case "jumpIfNot": return "if condition";
    default: return instr.op;
  }
}

/** The payoff lint, at one `if`: does its condition lean on a `may` that can be accepted without doing anything? */
function lintGate(instrs: Instr[], index: number, cond: Cond, defs: Defs, where: string, findings: ProgramResult["findings"]): void {
  for (const name of readsOf(cond)) {
    const mays = [...(defs.get(name) ?? [])].filter((d): d is Extract<Def, { kind: "confirm" }> => d.kind === "confirm" && !d.hasCosts);
    if (!mays.length) continue;
    const paysOffOnAccept = evalWith(cond, { [name]: 1 }) !== false;
    const paysOffOnDecline = evalWith(cond, { [name]: 0 }) !== false;
    if (paysOffOnAccept === paysOffOnDecline) continue; // not gated on the may at all, or on both outcomes
    const labels = mays.map((m) => m.label).join(", ");
    if (paysOffOnDecline) {
      // "If they do not": any acceptance that pays nothing, or only part, would dodge the penalty.
      findings.push({ kind: "ungated-may-payoff", where, name, reason: `"if not" payoff on ${name} of a may without costs (${labels}): declining is not the only way to skip it` });
      continue;
    }
    // "If you do": needs a cost (paid in full or not at all), or proof that an action happened.
    const requiresAffected = evalWith(cond, { [name]: 1, _affected: 0 }) === false;
    if (requiresAffected || payoffOnlyActsOnAffected(instrs, index)) continue;
    findings.push({ kind: "ungated-may-payoff", where, name, reason: `"if you do" payoff on ${name} of a may without costs (${labels}) that does not also require _affected: accepting and doing nothing still pays off` });
  }
}

// ---------------------------------------------------------------------------
// Whole abilities and registries
// ---------------------------------------------------------------------------

function lintWithDelays(program: Program, initial: Defs, where: string, delayed: (index: number) => Program | undefined): Omit<LintFinding, "cardId" | "abilityId">[] {
  const result = lintProgram(program, initial, where);
  const findings = [...result.findings];
  for (const [index, snapshot] of result.delaySnapshots) {
    const body = delayed(index);
    if (body) findings.push(...lintProgram(body, snapshot, `${where} (delayed effect ${index})`).findings);
  }
  return findings;
}

/** Everything about one ability that is checked without running it. */
export function lintAbility(cardId: string, ability: Ability): LintFinding[] {
  const found: Omit<LintFinding, "cardId" | "abilityId">[] = [];
  // Header gates, statics and event/replacement matchers are evaluated with no variables at all.
  const headers: [string, unknown][] = [
    ["gate conditions", ability.conditions],
    ["statics", ability.statics],
    ["event trigger", ability.eventTrigger],
    ["replacement match", ability.replacement ? { ...ability.replacement, instead: undefined } : undefined],
  ];
  for (const [where, data] of headers) {
    for (const name of readsOf(data)) found.push({ kind: "unbound-read", where, name, reason: `${where} are evaluated with no variables, but read ${name}` });
  }
  const initial = initialDefs(ability);
  if (ability.replacement) {
    found.push(...lintProgram(compileStandalone(ability.id, ability.replacement.instead), initial, "replacement").findings);
  } else {
    found.push(...lintWithDelays(compileAbility(ability), initial, "effect", (i) => (i < delayedEffects(ability).length ? compileDelayed(ability, i) : undefined)));
  }
  return found.map((f) => ({ cardId, abilityId: ability.id, ...f }));
}

/** Lint every ability of the registry the engine uses (generated abilities with the manual overrides applied). */
export function lintRegistry(registry: AbilityRegistry = ABILITY_REGISTRY): LintFinding[] {
  const out: LintFinding[] = [];
  for (const [cardId, record] of registry.cards) for (const ability of record.abilities) out.push(...lintAbility(cardId, ability));
  return out;
}

/** DSL fields that look like variable references but that the read table does not know about. */
export function unknownVarFields(registry: AbilityRegistry = ABILITY_REGISTRY): { cardId: string; abilityId: string; key: string }[] {
  const out: { cardId: string; abilityId: string; key: string }[] = [];
  for (const [cardId, record] of registry.cards) for (const ability of record.abilities) for (const key of unknownVarKeys(ability)) out.push({ cardId, abilityId: ability.id, key });
  return out;
}

export function formatFinding(f: LintFinding): string {
  return `${f.cardId} ${f.abilityId} [${f.kind}] ${f.where}: ${f.reason}`;
}
