import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearMatchResume,
  isResumeWithinGrace,
  isSeatReservationExpiredError,
  seatReservationUserMessage,
  loadMatchResume,
  saveMatchResume,
  type DuelResumeBlob,
} from "./matchResume";

const mem = new Map<string, string>();

afterEach(() => {
  mem.clear();
  clearMatchResume();
  vi.unstubAllGlobals();
});

function stubSessionStorage() {
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v);
    },
    removeItem: (k: string) => {
      mem.delete(k);
    },
  });
}

describe("matchResume", () => {
  it("round-trips a duel resume blob", () => {
    stubSessionStorage();
    const blob: DuelResumeBlob = {
      mode: "duel",
      serverUrl: "http://127.0.0.1:2567",
      roomId: "abc",
      reconnectionToken: "tok",
      seat: 0,
      savedAt: Date.now(),
    };
    saveMatchResume(blob);
    const loaded = loadMatchResume();
    expect(loaded).toMatchObject({
      mode: "duel",
      roomId: "abc",
      reconnectionToken: "tok",
      seat: 0,
    });
  });

  it("clears stale blobs past reconnect grace (+ buffer)", () => {
    stubSessionStorage();
    // Write directly so savedAt is not refreshed by saveMatchResume.
    mem.set(
      "optcg.duel.matchResume.v1",
      JSON.stringify({
        mode: "duel",
        serverUrl: "http://127.0.0.1:2567",
        roomId: "old",
        reconnectionToken: "tok",
        seat: 1,
        // Past 60s grace + 15s buffer.
        savedAt: Date.now() - 90 * 1000,
      }),
    );
    expect(loadMatchResume()).toBeNull();
  });

  it("keeps blobs still inside the grace window", () => {
    stubSessionStorage();
    mem.set(
      "optcg.duel.matchResume.v1",
      JSON.stringify({
        mode: "duel",
        serverUrl: "http://127.0.0.1:2567",
        roomId: "fresh",
        reconnectionToken: "tok",
        seat: 0,
        savedAt: Date.now() - 30 * 1000,
      }),
    );
    expect(loadMatchResume()?.roomId).toBe("fresh");
  });

  it("reports reconnect grace accurately", () => {
    const now = 1_000_000;
    expect(isResumeWithinGrace(now - 30_000, now)).toBe(true);
    expect(isResumeWithinGrace(now - 60_000, now)).toBe(true);
    expect(isResumeWithinGrace(now - 60_001, now)).toBe(false);
  });
});

describe("seat reservation errors", () => {
  it("detects Colyseus seat reservation expired messages", () => {
    expect(isSeatReservationExpiredError("seat reservation expired.")).toBe(true);
    expect(isSeatReservationExpiredError(new Error("seat reservation expired"))).toBe(true);
    expect(isSeatReservationExpiredError("room not found")).toBe(false);
  });

  it("exposes a non-Colyseus user message", () => {
    expect(seatReservationUserMessage().toLowerCase()).not.toContain("seat reservation expired");
    expect(seatReservationUserMessage().toLowerCase()).toContain("claim a seat");
  });
});
