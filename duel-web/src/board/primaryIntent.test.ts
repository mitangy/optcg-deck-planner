import { describe, expect, it } from "vitest";
import type { Intent } from "../net/protocol";
import { splitPrimaryIntent } from "./primaryIntent";

const endTurn: Intent = { type: "end_turn" };
const passCounter: Intent = { type: "pass_counter" };
const passBlock: Intent = { type: "pass_block" };
const keep: Intent = { type: "mulligan", doMulligan: false };
const redo: Intent = { type: "mulligan", doMulligan: true };
const play: Intent = { type: "play_card", handIndex: 0 };
const attack: Intent = { type: "declare_attack", attackerId: "a", target: { kind: "leader" } };

describe("splitPrimaryIntent", () => {
  it("prefers answering an attack over ending the turn", () => {
    expect(splitPrimaryIntent([endTurn, play, passCounter]).primary).toBe(passCounter);
    expect(splitPrimaryIntent([endTurn, passBlock]).primary).toBe(passBlock);
  });

  it("uses End turn in the main phase", () => {
    expect(splitPrimaryIntent([play, attack, endTurn]).primary).toBe(endTurn);
  });

  it("makes keeping the hand primary but never the redraw", () => {
    expect(splitPrimaryIntent([redo, keep]).primary).toBe(keep);
    expect(splitPrimaryIntent([redo]).primary).toBeNull();
  });

  it("never picks an answer the choice prompt owns", () => {
    const pending: Intent[] = [
      { type: "resolve_pending_choice", accept: true },
      { type: "order_pending_effects", order: [] },
    ];
    expect(splitPrimaryIntent(pending)).toEqual({ primary: null, rest: pending });
  });

  it("leaves everything but the primary in rest, in order", () => {
    const { primary, rest } = splitPrimaryIntent([play, endTurn, attack]);
    expect(primary).toBe(endTurn);
    expect(rest).toEqual([play, attack]);
  });

  it("returns no primary when nothing advances the game", () => {
    const { primary, rest } = splitPrimaryIntent([play, attack]);
    expect(primary).toBeNull();
    expect(rest).toEqual([play, attack]);
  });
});
