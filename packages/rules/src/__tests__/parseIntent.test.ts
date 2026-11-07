import { describe, expect, it } from "vitest";
import { buildTestDeck, DEFAULT_LEADER_ID } from "../cards/definitions.js";
import { applyIntent, createMatch, listLegalIntents, skipMulligans } from "../engine.js";
import { parseIntent } from "../engine/parseIntent.js";

describe("parseIntent", () => {
  const rejects: [string, unknown, "BAD_INTENT" | "UNKNOWN_INTENT"][] = [
    ["play_card with a string handIndex (the 'length' probe)", { type: "play_card", handIndex: "length" }, "BAD_INTENT"],
    ["play_card with a negative handIndex", { type: "play_card", handIndex: -1 }, "BAD_INTENT"],
    ["play_card with a fractional handIndex", { type: "play_card", handIndex: 1.5 }, "BAD_INTENT"],
    ["play_card with a missing handIndex", { type: "play_card" }, "BAD_INTENT"],
    ["play_card with a non-string trashCharacterId", { type: "play_card", handIndex: 0, trashCharacterId: 5 }, "BAD_INTENT"],
    ["counter_event with a string handIndex", { type: "counter_event", handIndex: "0" }, "BAD_INTENT"],
    ["counter_from_hand with NaN handIndex", { type: "counter_from_hand", handIndex: NaN }, "BAD_INTENT"],
    ["mulligan with a string boolean", { type: "mulligan", doMulligan: "true" }, "BAD_INTENT"],
    ["give_don with an empty donId", { type: "give_don", donId: "", targetId: "x" }, "BAD_INTENT"],
    ["give_don with a missing targetId", { type: "give_don", donId: "d" }, "BAD_INTENT"],
    ["activate_ability with a numeric abilityId", { type: "activate_ability", sourceId: "a", abilityId: 1 }, "BAD_INTENT"],
    ["declare_attack with a string target", { type: "declare_attack", attackerId: "a", target: "leader" }, "BAD_INTENT"],
    ["declare_attack with an unknown target kind", { type: "declare_attack", attackerId: "a", target: { kind: "stage" } }, "BAD_INTENT"],
    ["declare_attack at a character without an instanceId", { type: "declare_attack", attackerId: "a", target: { kind: "character" } }, "BAD_INTENT"],
    ["declare_block with a missing blockerId", { type: "declare_block" }, "BAD_INTENT"],
    ["resolve_pending_choice without accept", { type: "resolve_pending_choice" }, "BAD_INTENT"],
    ["resolve_pending_choice with a non-array selection", { type: "resolve_pending_choice", accept: true, selectedOptionIds: "a" }, "BAD_INTENT"],
    ["resolve_pending_choice with a non-string option id", { type: "resolve_pending_choice", accept: true, topOptionIds: [1] }, "BAD_INTENT"],
    ["order_pending_effects with a non-array", { type: "order_pending_effects", orderedIds: "a" }, "BAD_INTENT"],
    ["an array instead of an object", [], "BAD_INTENT"],
    ["null", null, "BAD_INTENT"],
    ["an unknown type", { type: "nonsense" }, "UNKNOWN_INTENT"],
    ["a non-string type", { type: 5 }, "UNKNOWN_INTENT"],
    ["an inherited property name as type", { type: "constructor" }, "UNKNOWN_INTENT"],
  ];
  it.each(rejects)("rejects %s (refactor 0.2)", (_name, raw, code) => {
    const r = parseIntent(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe(code);
      expect(r.message.length).toBeGreaterThan(0);
    }
  });

  it("accepts well-formed intents and strips unknown fields (refactor 0.2)", () => {
    expect(parseIntent({ type: "play_card", handIndex: 0, extra: 1 })).toEqual({ ok: true, intent: { type: "play_card", handIndex: 0 } });
    expect(parseIntent({ type: "play_card", handIndex: 2, trashCharacterId: "c1" })).toEqual({
      ok: true,
      intent: { type: "play_card", handIndex: 2, trashCharacterId: "c1" },
    });
    expect(parseIntent({ type: "declare_attack", attackerId: "a", target: { kind: "character", instanceId: "b", junk: 1 } })).toEqual({
      ok: true,
      intent: { type: "declare_attack", attackerId: "a", target: { kind: "character", instanceId: "b" } },
    });
    expect(parseIntent({ type: "resolve_pending_choice", accept: false, selectedOptionIds: [], topOptionIds: ["t"] })).toEqual({
      ok: true,
      intent: { type: "resolve_pending_choice", accept: false, selectedOptionIds: [], topOptionIds: ["t"] },
    });
    expect(parseIntent({ type: "end_turn", extra: 1 })).toEqual({ ok: true, intent: { type: "end_turn" } });
  });

  it("accepts every legal intent the engine offers along a played game, unchanged (refactor 0.2)", () => {
    const deck = buildTestDeck(20);
    let state = skipMulligans(
      createMatch({ seed: 3, firstSeat: 0, players: [{ leaderId: DEFAULT_LEADER_ID, deck: [...deck] }, { leaderId: DEFAULT_LEADER_ID, deck: [...deck] }] }),
    );
    const seen = new Set<string>();
    for (let step = 0; step < 60 && state.winner === null; step += 1) {
      const seat = ([0, 1] as const).find((s) => listLegalIntents(state, s).length > 0);
      expect(seat).toBeDefined();
      const legal = listLegalIntents(state, seat!);
      for (const intent of legal) {
        seen.add(intent.type);
        expect(parseIntent(JSON.parse(JSON.stringify(intent)))).toEqual({ ok: true, intent });
      }
      // Alternate between the first and last offer so the game moves through several phases.
      const r = applyIntent(state, legal[step % 2 === 0 ? 0 : legal.length - 1]!, { seat: seat! });
      expect(r.ok, r.error?.message).toBe(true);
      state = r.state;
    }
    expect(seen.size).toBeGreaterThan(3);
  });
});
