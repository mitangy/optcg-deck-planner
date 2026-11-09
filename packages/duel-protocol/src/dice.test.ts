import { describe, expect, it } from "vitest";
import { parseDiceMessage } from "./clientMessages";
import { parseDiceResult, parseDiceState } from "./serverMessages";

const v = { protocolVersion: 5 };

describe("dice messages (#1190)", () => {
  it("accepts each action a client may send and refuses a call without High or Low", () => {
    expect(parseDiceMessage({ ...v, action: "call", call: "high" })).toEqual({ action: "call", call: "high" });
    expect(parseDiceMessage({ ...v, action: "call", call: "low" })).toEqual({ action: "call", call: "low" });
    expect(parseDiceMessage({ ...v, action: "roll" })).toEqual({ action: "roll" });
    expect(parseDiceMessage({ ...v, action: "first" })).toEqual({ action: "first" });
    expect(parseDiceMessage({ ...v, action: "second" })).toEqual({ action: "second" });
    expect(() => parseDiceMessage({ ...v, action: "call" })).toThrow("high|low");
    expect(() => parseDiceMessage({ ...v, action: "call", call: "middle" })).toThrow("high|low");
    expect(() => parseDiceMessage({ ...v, action: "request" })).toThrow("call|roll|first|second");
    expect(() => parseDiceMessage({ action: "roll" })).toThrow("protocolVersion");
  });

  const state = { ...v, roller: 0, caller: 1, step: "roll", call: "high", roll: null, winner: null, deadline: 1_700_000_020_000, seat: 1, role: "player" };

  it("reads a dice_state and keeps a roll only when it is a die face", () => {
    expect(parseDiceState(state)).toMatchObject({ roller: 0, caller: 1, step: "roll", call: "high", roll: null, deadline: 1_700_000_020_000, seat: 1, role: "player" });
    expect(parseDiceState({ ...state, step: "choose", roll: 6, winner: 1 })).toMatchObject({ roll: 6, winner: 1 });
    expect(parseDiceState({ ...state, roll: 7 }).roll).toBeNull();
    expect(parseDiceState({ ...state, roll: 0 }).roll).toBeNull();
    expect(parseDiceState({ ...state, roll: 2.5 }).roll).toBeNull();
  });

  it("refuses a dice_state with an unknown step or no seat", () => {
    expect(() => parseDiceState({ ...state, step: "juggle" })).toThrow("step");
    expect(() => parseDiceState({ ...state, seat: undefined })).toThrow("seats");
    expect(() => parseDiceState({ ...state, roller: 2 })).toThrow("seats");
  });

  it("shows a welcome's dice result only when every part is right", () => {
    const result = { roller: 0, caller: 1, call: "low", roll: 2, winner: 1 };
    expect(parseDiceResult(result)).toEqual(result);
    expect(parseDiceResult({ ...result, roll: 9 })).toBeUndefined();
    expect(parseDiceResult({ ...result, call: "mid" })).toBeUndefined();
    expect(parseDiceResult({ ...result, winner: null })).toBeUndefined();
    expect(parseDiceResult(null)).toBeUndefined();
  });
});
