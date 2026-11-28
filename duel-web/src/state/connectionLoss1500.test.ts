import { describe, expect, it, vi } from "vitest";
import {
  classifyReconnectFailure,
  findRematchFriend,
  gameGoneMeansRestart,
  reconnectUntilSettled,
  type RematchPlan,
} from "./connectionLoss";

const noSleep = () => Promise.resolve();

describe("telling a restart from a network drop (#1500)", () => {
  it("a room that is gone is the game being lost; a failed request is a drop; anything else is a refusal (#1500)", () => {
    expect(classifyReconnectFailure(new Error('room "abc123" has been disposed.'))).toBe("game_gone");
    expect(classifyReconnectFailure(new Error('room "abc123" not found'))).toBe("game_gone");
    expect(classifyReconnectFailure(new TypeError("Failed to fetch"))).toBe("network");
    expect(classifyReconnectFailure(new Error("Request timed out"))).toBe("network");
    expect(classifyReconnectFailure(new Error("reconnection token invalid or expired."))).toBe("other");
    expect(classifyReconnectFailure(new Error("seat reservation expired"))).toBe("other");
  });

  it("a network drop keeps trying and joins once the server answers (#1500)", async () => {
    const attempt = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue({ seat: 0 });
    const r = await reconnectUntilSettled({ attempt, active: () => true, sleep: noSleep });
    expect(r).toEqual({ kind: "joined", value: { seat: 0 } });
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it("a missing room stops at once instead of retrying a game that cannot come back (#1500)", async () => {
    const attempt = vi.fn().mockRejectedValue(new Error('room "x" has been disposed.'));
    const r = await reconnectUntilSettled({ attempt, active: () => true, sleep: noSleep });
    expect(r.kind).toBe("game_gone");
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("a server that stays unreachable ends as unreachable, not as a lost game (#1500)", async () => {
    const attempt = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const r = await reconnectUntilSettled({ attempt, active: () => true, sleep: noSleep, delaysMs: [1, 1, 1] });
    expect(r.kind).toBe("unreachable");
    expect(attempt).toHaveBeenCalledTimes(4);
  });

  it("a refusal other than a missing room is not retried (#1500)", async () => {
    const attempt = vi.fn().mockRejectedValue(new Error("seat reservation expired"));
    const r = await reconnectUntilSettled({ attempt, active: () => true, sleep: noSleep });
    expect(r.kind).toBe("refused");
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("stops quietly once the player has left (#1500)", async () => {
    let active = true;
    const attempt = vi.fn().mockImplementation(() => {
      active = false;
      return Promise.reject(new TypeError("Failed to fetch"));
    });
    const r = await reconnectUntilSettled({ attempt, active: () => active, sleep: noSleep });
    expect(r.kind).toBe("cancelled");
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("a room gone while the server kept running is not called a restart (#1500)", () => {
    expect(gameGoneMeansRestart("pid-1", "pid-1")).toBe(false);
    expect(gameGoneMeansRestart("pid-1", "pid-2")).toBe(true);
    expect(gameGoneMeansRestart(null, "pid-2")).toBe(true);
    expect(gameGoneMeansRestart("pid-1", null)).toBe(true);
  });
});

describe("who a rematch invites after a restart (#1500)", () => {
  const plan: RematchPlan = { deck: { leaderId: "ST01-001", deck: [] }, bot: null, opponentName: "Zoro" };
  const friends = [{ username: "Nami" }, { username: "ZORO" }];

  it("finds the opponent among the friends, ignoring case (#1500)", () => {
    expect(findRematchFriend(plan, friends)).toBe(friends[1]);
  });

  it("offers no friend for a bot game, a stranger or an unnamed opponent (#1500)", () => {
    expect(findRematchFriend({ ...plan, bot: { level: "easy", deck: plan.deck } }, friends)).toBeNull();
    expect(findRematchFriend({ ...plan, opponentName: "Stranger" }, friends)).toBeNull();
    expect(findRematchFriend({ ...plan, opponentName: null }, friends)).toBeNull();
    expect(findRematchFriend(null, friends)).toBeNull();
  });
});
