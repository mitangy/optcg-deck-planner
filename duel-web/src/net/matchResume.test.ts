import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearMatchResume,
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

  it("clears stale blobs", () => {
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
        savedAt: Date.now() - 11 * 60 * 1000,
      }),
    );
    expect(loadMatchResume()).toBeNull();
  });
});
