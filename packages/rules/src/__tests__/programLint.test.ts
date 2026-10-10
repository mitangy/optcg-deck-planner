/**
 * Static lints over every compiled ability program (tools/cardText/programLint.ts): no card may read a variable that
 * nothing writes, and no "if you do / if they do not" payoff may hang on a `may` that is not a cost. The first
 * describe runs the lint over the real registry; the rest pin the lint itself on small hand-written programs.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ABILITY_REGISTRY } from "../cards/abilities.js";
import type { Ability, Cond, Effect, GameEventKind } from "../effects/types.js";
import { EVENT_CARRIES_CARD, formatFinding, lintAbility, lintRegistry, unknownVarFields, type FindingKind } from "../tools/cardText/programLint.js";
import { applyAllowlist, PROGRAM_LINT_ALLOWLIST } from "../tools/cardText/programLintAllowlist.js";

describe("program lint over the card registry", () => {
  const findings = lintRegistry();
  const result = applyAllowlist(findings);

  it("no compiled program reads an unbound variable or pays off an ungated may", () => {
    expect(result.unexpected.map(formatFinding)).toEqual([]);
  });

  it("every allowlist entry still matches a finding and says why", () => {
    expect(result.stale).toEqual([]);
    for (const [id, entry] of Object.entries(PROGRAM_LINT_ALLOWLIST)) {
      expect(ABILITY_REGISTRY.abilities.has(id), id).toBe(true);
      expect(entry.reason.length, id).toBeGreaterThan(20);
    }
  });

  it("knows every variable-reading field in the card data", () => {
    expect(unknownVarFields()).toEqual([]);
  });

  it("EVENT_CARRIES_CARD matches what dispatchEvent passes", () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), "../engine");
    const sites = new Map<string, boolean[]>();
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
      for (const line of readFileSync(join(dir, file), "utf8").split("\n")) {
        const m = /\bdispatchEvent\(\s*\w+(?:\.\w+)?,\s*"(\w+)"(.*)/.exec(line);
        if (m && !line.includes("function dispatchEvent")) sites.set(m[1]!, [...(sites.get(m[1]!) ?? []), /\bcard:/.test(m[2]!)]);
      }
    }
    expect(sites.size).toBeGreaterThan(10);
    for (const [kind, passes] of sites) expect(EVENT_CARRIES_CARD[kind as GameEventKind], kind).toBe(passes.every(Boolean));
  });
});

// ---------------------------------------------------------------------------
// The lint itself
// ---------------------------------------------------------------------------

const ability = (effect: Effect, extra: Partial<Ability> = {}): Ability => ({ id: "t#0", trigger: "on_play", text: "test", effect, ...extra });
const kinds = (a: Ability): FindingKind[] => lintAbility("T-001", a).map((f) => f.kind);
const reads = (name: string): Cond => ({ c: "var_all_match", name, filter: {} });
const countAtLeast = (name: string, value = 1): Cond => ({ c: "var_count", name, op: ">=", value });
const countIs0 = (name: string): Cond => ({ c: "var_count", name, op: "==", value: 0 });
const self = { ref: "self" } as const;
const buff: Effect = { do: "power", target: self, amount: 1000, duration: "turn" };
const drawOne: Effect = { do: "draw", player: "you", count: 1 };
const trash = { k: "trash_hand", count: 1 } as const;
const chooseOpp = { ref: "choose", selector: { player: "opponent", zone: "character" }, min: 0, max: 1 } as const;

describe("unbound reads", () => {
  it("flags a read of a variable no step writes and passes once an earlier step binds it (#515)", () => {
    const readLast: Effect = { do: "if", cond: reads("_last"), then: buff };
    expect(kinds(ability(readLast))).toEqual(["unbound-read"]);
    expect(kinds(ability({ do: "seq", steps: [{ do: "mill", player: "you", count: 1, bind: "_last" }, readLast] }))).toEqual([]);
    expect(kinds(ability({ do: "seq", steps: [{ do: "mill", player: "you", count: 1 }, readLast] }))).toEqual(["unbound-read"]);
  });

  it("reads before the binding step do not count, and a choose target binds `_last` by default (#515)", () => {
    const readLast: Effect = { do: "to_deck", target: { ref: "var", name: "_last" }, position: "top" };
    const choose: Effect = { do: "ko", target: chooseOpp };
    expect(kinds(ability({ do: "seq", steps: [choose, readLast] }))).toEqual([]);
    expect(kinds(ability({ do: "seq", steps: [readLast, choose] }))).toEqual(["unbound-read"]);
  });

  it("a reveal_hand cost binds the revealed card as `_last` (ST22-001) (#515)", () => {
    const costed = ability({ do: "to_deck", target: { ref: "var", name: "_last" }, position: "top" }, { trigger: "activate_main", costs: [{ k: "reveal_hand", count: 1 }] });
    expect(kinds(costed)).toEqual([]);
    expect(kinds({ ...costed, costs: [{ k: "rest_don", count: 1 }] })).toEqual(["unbound-read"]);
  });

  it("`_affected` is written by removals and plays but not by to_life (#515)", () => {
    const afterwards = (first: Effect): Ability => ability({ do: "seq", steps: [first, { do: "if", cond: countAtLeast("_affected"), then: drawOne }] });
    expect(kinds(afterwards({ do: "to_hand", target: chooseOpp }))).toEqual([]);
    expect(kinds(afterwards({ do: "play", target: chooseOpp }))).toEqual([]);
    expect(kinds(afterwards({ do: "to_life", target: chooseOpp, position: "top", faceUp: false }))).toEqual(["unbound-read"]);
  });

  it("filters that name a variable read it (#515)", () => {
    const koExcluding = (filter: { excludeVar: string }): Effect => ({ do: "ko", target: { ...chooseOpp, selector: { player: "opponent", zone: "character", filter } } });
    expect(kinds(ability(koExcluding({ excludeVar: "_picked" })))).toEqual(["unbound-read"]);
    expect(kinds(ability({ do: "seq", steps: [{ do: "select", bind: "_picked", selector: { player: "you", zone: "character" }, min: 0, max: 1 }, koExcluding({ excludeVar: "_picked" })] }))).toEqual([]);
  });

  it("a binding on only one branch still counts as bound afterwards (#515)", () => {
    const branchy: Effect = { do: "seq", steps: [
      { do: "if", cond: { c: "your_turn" }, then: { do: "mill", player: "you", count: 1, bind: "_m" } },
      { do: "if", cond: reads("_m"), then: buff },
    ] };
    expect(kinds(ability(branchy))).toEqual([]);
  });

  it("`_event` is bound only for event triggers whose event carries a card (OP11-088) (#515)", () => {
    const readsEvent = (event: GameEventKind): Ability => ability({ do: "if", cond: reads("_event"), then: buff }, { trigger: "on_event", eventTrigger: { event, player: "opponent" } });
    expect(kinds(readsEvent("attack_declared"))).toEqual([]);
    expect(kinds(readsEvent("self_ko"))).toEqual(["unbound-read"]);
    expect(kinds({ ...readsEvent("attack_declared"), eventTrigger: { event: "attack_declared", alsoEvents: ["don_returned"], player: "opponent" } })).toEqual(["unbound-read"]);
    expect(kinds({ ...readsEvent("attack_declared"), trigger: "on_play" })).toEqual(["unbound-read"]);
    // The event_card target reads `_event` too.
    expect(kinds(ability({ do: "ko", target: { ref: "event_card" } }, { trigger: "on_play" }))).toEqual(["unbound-read"]);
  });

  it("replacements start with `_target` and `_last` but not `_event` (#515)", () => {
    const replacement = (instead: Effect): Ability => ({ id: "t#0", trigger: "replacement", text: "test", replacement: { event: "ko", target: "self", instead, optional: false } });
    expect(kinds(replacement({ do: "to_deck", target: { ref: "var", name: "_target" }, position: "top" }))).toEqual([]);
    expect(kinds(replacement({ do: "to_deck", target: { ref: "var", name: "_event" }, position: "top" }))).toEqual(["unbound-read"]);
  });

  it("header conditions and statics have no variables to read (#515)", () => {
    expect(kinds(ability(buff, { conditions: [countAtLeast("_did")] }))).toEqual(["unbound-read"]);
    expect(kinds({ id: "t#0", trigger: "static", text: "test", statics: [{ s: "power", target: { all: { player: "you", zone: "character", filter: { excludeVar: "_last" } } }, amount: 1000 }] })).toEqual(["unbound-read"]);
  });

  it("a delayed effect sees what was bound before the delay and nothing after it (#515)", () => {
    const delayedRead: Effect = { do: "delay", when: "end_of_turn", effect: { do: "to_hand", target: { ref: "var", name: "_m" } } };
    const mill: Effect = { do: "mill", player: "you", count: 1, bind: "_m" };
    expect(kinds(ability({ do: "seq", steps: [mill, delayedRead] }))).toEqual([]);
    expect(kinds(ability({ do: "seq", steps: [delayedRead, mill] }))).toEqual(["unbound-read"]);
  });
});

describe("ungated may payoffs", () => {
  const may = (extra: { costs?: { k: "trash_hand"; count: 1 }[]; chooser?: "opponent" }, then: Effect = { do: "to_trash", target: chooseOpp }): Effect => ({ do: "may", then, bind: "_did", ...extra } as Effect);
  const payoff = (cond: Cond, then: Effect = drawOne, otherwise?: Effect): Effect => ({ do: "if", cond, then, ...(otherwise ? { else: otherwise } : {}) });

  it("an \"if you do\" payoff needs a cost on the may (#213)", () => {
    expect(kinds(ability({ do: "seq", steps: [may({}), payoff(countAtLeast("_did"))] }))).toEqual(["ungated-may-payoff"]);
    expect(kinds(ability({ do: "seq", steps: [may({ costs: [trash] }), payoff(countAtLeast("_did"))] }))).toEqual([]);
  });

  it("or the condition also requires `_affected` (OP13-119) (#213)", () => {
    const both: Cond = { c: "and", conds: [countAtLeast("_did"), countAtLeast("_affected")] };
    expect(kinds(ability({ do: "seq", steps: [may({}), payoff(both)] }))).toEqual([]);
    expect(kinds(ability({ do: "seq", steps: [may({}), payoff({ c: "and", conds: [countAtLeast("_did"), { c: "your_turn" }] })] }))).toEqual(["ungated-may-payoff"]);
  });

  it("or the payoff only acts on what the may affected (OP12-058) (#213)", () => {
    const onAffected: Effect = { do: "keyword", target: { ref: "var", name: "_affected" }, keyword: "rush", duration: "turn" };
    expect(kinds(ability({ do: "seq", steps: [may({}), payoff(countAtLeast("_did"), onAffected)] }))).toEqual([]);
    expect(kinds(ability({ do: "seq", steps: [may({}), payoff(countAtLeast("_did"), { do: "seq", steps: [onAffected, drawOne] })] }))).toEqual(["ungated-may-payoff"]);
    expect(kinds(ability({ do: "seq", steps: [may({}), payoff(countAtLeast("_did"), onAffected, drawOne)] }))).toEqual(["ungated-may-payoff"]);
  });

  it("an \"if they do not\" payoff needs the opponent's may to be a cost (OP17-117) (#515)", () => {
    const penalty = payoff(countIs0("_did"), { do: "ko", target: chooseOpp });
    expect(kinds(ability({ do: "seq", steps: [may({ chooser: "opponent" }, { do: "discard", player: "opponent", count: 3 }), penalty] }))).toEqual(["ungated-may-payoff"]);
    expect(kinds(ability({ do: "seq", steps: [may({ chooser: "opponent", costs: [trash] }, { do: "nothing" }), penalty] }))).toEqual([]);
  });

  it("follows the may through branches: a nested may is checked, a later costed may replaces it (ST13-007) (#213)", () => {
    const nested: Effect = { do: "seq", steps: [{ do: "if", cond: { c: "your_turn" }, then: may({}) }, payoff(countAtLeast("_did"))] };
    expect(kinds(ability(nested))).toEqual(["ungated-may-payoff"]);
    expect(kinds(ability({ do: "seq", steps: [may({}), may({ costs: [trash] }), payoff(countAtLeast("_did"))] }))).toEqual([]);
  });

  it("a condition on something other than the may, or on both outcomes, is not a payoff gate (#213)", () => {
    expect(kinds(ability({ do: "seq", steps: [may({}), payoff({ c: "your_turn" })] }))).toEqual([]);
    // With an `or` the payoff can run without the may.
    expect(kinds(ability({ do: "seq", steps: [may({}), payoff({ c: "or", conds: [countAtLeast("_did"), { c: "your_turn" }] })] }))).toEqual([]);
    expect(kinds(ability({ do: "seq", steps: [may({}), payoff({ c: "or", conds: [countAtLeast("_did"), countIs0("_did")] })] }))).toEqual([]);
  });
});

describe("allowlist", () => {
  const finding = { kind: "unbound-read" as const, cardId: "T-001", abilityId: "t#0", where: "effect", name: "_x", reason: "r" };
  it("matches by ability id and kind, and reports entries that match nothing (#515)", () => {
    expect(applyAllowlist([finding], { "t#0": { kind: "unbound-read", reason: "why" } })).toMatchObject({ unexpected: [], stale: [] });
    expect(applyAllowlist([finding], { "t#0": { kind: "ungated-may-payoff", reason: "why" } }).unexpected).toHaveLength(1);
    expect(applyAllowlist([], { "t#0": { kind: "unbound-read", reason: "why" } }).stale).toEqual(["t#0"]);
  });
});
