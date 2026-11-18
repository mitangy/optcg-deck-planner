import { describe, expect } from "vitest";
import { fc, test } from "@fast-check/vitest";
import { applyIntent, createMatch, listLegalIntents } from "../engine.js";
import { parseIntent } from "../engine/parseIntent.js";
import { createSeededRng } from "../rng.js";
import { actingSeat, randomAnswer, randomDeck } from "../sim/fuzz.js";
import type { Intent, Seat } from "../types.js";

const INTENT_TYPES = [
  "mulligan",
  "play_card",
  "give_don",
  "activate_ability",
  "declare_attack",
  "declare_block",
  "counter_from_hand",
  "counter_event",
  "resolve_pending_choice",
  "order_pending_effects",
  "pass_block",
  "pass_counter",
  "end_turn",
] as const;

const FIELDS = [
  "doMulligan",
  "handIndex",
  "trashCharacterId",
  "donId",
  "targetId",
  "sourceId",
  "abilityId",
  "attackerId",
  "target",
  "blockerId",
  "accept",
  "selectedOptionIds",
  "orderedOptionIds",
  "topOptionIds",
  "orderedIds",
] as const;

const junk = fc.oneof(
  fc.jsonValue(),
  fc.anything(),
  fc.constantFrom(undefined, null, NaN, Infinity, -0, -1, 1.5, 2 ** 53, "length", "__proto__", "", [], {}),
);

const ALLOWED_KEYS: Record<(typeof INTENT_TYPES)[number], readonly string[]> = {
  mulligan: ["type", "doMulligan"],
  play_card: ["type", "handIndex", "trashCharacterId"],
  give_don: ["type", "donId", "targetId"],
  activate_ability: ["type", "sourceId", "abilityId", "targetId"],
  declare_attack: ["type", "attackerId", "target"],
  declare_block: ["type", "blockerId"],
  counter_from_hand: ["type", "handIndex"],
  counter_event: ["type", "handIndex"],
  resolve_pending_choice: ["type", "accept", "selectedOptionIds", "orderedOptionIds", "topOptionIds"],
  order_pending_effects: ["type", "orderedIds"],
  pass_block: ["type"],
  pass_counter: ["type"],
  end_turn: ["type"],
};

/** A value that is valid for the field, so most generated intents are accepted and every field gets exercised. */
const validFor = (k: string): fc.Arbitrary<unknown> => {
  const id = fc.string({ minLength: 1, maxLength: 6 });
  if (k === "handIndex") return fc.nat({ max: 12 });
  if (k === "doMulligan" || k === "accept") return fc.boolean();
  if (k.endsWith("OptionIds") || k === "orderedIds") return fc.array(id, { maxLength: 4 });
  if (k === "target") return fc.oneof(fc.constant({ kind: "leader" }), id.map((instanceId) => ({ kind: "character", instanceId, extra: 1 })));
  return id;
};

const field = (k: string) =>
  fc.oneof({ weight: 6, arbitrary: validFor(k) }, { weight: 2, arbitrary: junk }, { weight: 1, arbitrary: fc.constantFrom(undefined, null) });

const structured = fc.constantFrom(...INTENT_TYPES).chain((type) =>
  fc
    .tuple(...ALLOWED_KEYS[type].filter((k) => k !== "type").map((k) => fc.tuple(fc.constant(k), field(k))), fc.jsonValue())
    .map((entries) => {
      const extra = entries.pop() as unknown;
      return { type, ...Object.fromEntries(entries as [string, unknown][]), unexpected: extra };
    }),
);

const rawArb = fc.oneof(
  { weight: 1, arbitrary: junk },
  { weight: 4, arbitrary: structured },
  {
    weight: 1,
    arbitrary: fc
      .tuple(fc.constantFrom(...INTENT_TYPES), fc.array(fc.tuple(fc.constantFrom(...FIELDS), junk), { maxLength: 6 }))
      .map(([type, fields]) => ({ type, ...Object.fromEntries(fields) })),
  },
  { weight: 1, arbitrary: junk.map((target) => ({ type: "declare_attack", attackerId: "a", target })) },
);

const isId = (v: unknown) => typeof v === "string" && v.length > 0;
const isIdList = (v: unknown) => Array.isArray(v) && v.every(isId);

function expectWellFormed(intent: Intent): void {
  const o = intent as unknown as Record<string, unknown>;
  expect(Object.keys(o).filter((k) => !ALLOWED_KEYS[intent.type].includes(k))).toEqual([]);
  for (const [k, v] of Object.entries(o)) {
    if (k === "type") continue;
    if (k === "handIndex") expect(typeof v === "number" && Number.isSafeInteger(v) && v >= 0).toBe(true);
    else if (k === "doMulligan" || k === "accept") expect(typeof v).toBe("boolean");
    else if (k.endsWith("OptionIds") || k === "orderedIds") expect(isIdList(v)).toBe(true);
    else if (k === "target") {
      const t = v as { kind?: unknown; instanceId?: unknown };
      expect(t.kind === "leader" || (t.kind === "character" && isId(t.instanceId))).toBe(true);
    } else expect(isId(v)).toBe(true);
  }
  const required = intent.type === "play_card" ? ["handIndex"] : intent.type === "give_don" ? ["donId", "targetId"] : [];
  for (const k of required) expect(o).toHaveProperty(k);
}

function expectEchoes(raw: unknown, intent: Intent): void {
  const src = raw as Record<string, unknown>;
  const out = intent as unknown as Record<string, unknown>;
  expect(src.type).toBe(intent.type);
  for (const k of ALLOWED_KEYS[intent.type]) {
    if (k === "type") continue;
    if (src[k] === undefined || src[k] === null) {
      expect(out[k]).toBeUndefined();
    } else if (k === "target") {
      const t = src[k] as { kind: string; instanceId?: string };
      expect(out[k]).toEqual(t.kind === "leader" ? { kind: "leader" } : { kind: "character", instanceId: t.instanceId });
    } else {
      expect(out[k]).toEqual(src[k]);
    }
  }
}

describe("parseIntent properties (#1322)", () => {
  test.prop([rawArb], { numRuns: 1000 })(
    "parseIntent never throws on arbitrary values and only accepts well-formed intents built from the raw fields (#1322)",
    (raw) => {
      const r = parseIntent(raw);
      if (r.ok) {
        expect(INTENT_TYPES).toContain(r.intent.type);
        expectWellFormed(r.intent);
        expectEchoes(raw, r.intent);
      } else {
        expect(["BAD_INTENT", "UNKNOWN_INTENT"]).toContain(r.code);
        expect(typeof r.message).toBe("string");
      }
    },
  );

  test.prop([rawArb], { numRuns: 500 })(
    "an accepted intent parses again to itself (#1322)",
    (raw) => {
      const r = parseIntent(raw);
      fc.pre(r.ok);
      if (!r.ok) return;
      const again = parseIntent(r.intent);
      expect(again).toEqual({ ok: true, intent: r.intent });
    },
  );

  test.prop([fc.integer({ min: 0, max: 2 ** 31 - 1 })], { numRuns: 25 })(
    "every legal intent of a played game survives a JSON round trip through parseIntent unchanged (#1322)",
    (seed) => {
      const rng = createSeededRng(seed);
      const a = randomDeck(rng);
      const b = randomDeck(rng);
      let state = createMatch({ seed, firstSeat: (seed % 2) as Seat, players: [a, b] });
      const seen = new Set<string>();
      for (let step = 0; step < 60 && state.winner === null; step++) {
        const seat = actingSeat(state);
        const legal = listLegalIntents(state, seat);
        if (legal.length === 0) break;
        for (const intent of legal) {
          seen.add(intent.type);
          const parsed = parseIntent(JSON.parse(JSON.stringify(intent)));
          expect(parsed).toEqual({ ok: true, intent });
        }
        const front = state.pendingChoices[0];
        let pick: Intent = legal[rng.nextInt(legal.length)]!;
        if (front && front.seat === seat && rng.next() < 0.8) pick = randomAnswer(rng, front);
        let r = applyIntent(state, pick, { seat });
        if (!r.ok) r = applyIntent(state, legal[0]!, { seat });
        if (!r.ok) break;
        state = r.state;
      }
      expect(seen.size).toBeGreaterThan(0);
    },
  );
});
