import { describe, expect, it } from "vitest";
import { LAST_MODE_KEY, readLastMode, toLastMode, writeLastMode } from "./lastMode";

type Store = Pick<Storage, "getItem" | "setItem">;
function memory(seed: Record<string, string> = {}): Store & { data: Record<string, string> } {
  const data = { ...seed };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}
const throwing: Store = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("last Play mode", () => {
  it("stores joining a room as the private room mode, so Play reopens Create (#431)", () => {
    expect(toLastMode("join")).toBe("create");
    const s = memory();
    writeLastMode("join", s);
    expect(s.data[LAST_MODE_KEY]).toBe("create");
    expect(readLastMode(s)).toBe("create");
  });

  it("keeps the other three modes as they are (#431)", () => {
    for (const m of ["hotseat", "queue", "spectate", "create"] as const) {
      const s = memory();
      writeLastMode(m, s);
      expect(readLastMode(s)).toBe(m);
    }
  });

  it("reads an unknown or missing value as no last mode (#431)", () => {
    expect(readLastMode(memory({ [LAST_MODE_KEY]: "ranked" }))).toBeNull();
    expect(readLastMode(memory({ [LAST_MODE_KEY]: "" }))).toBeNull();
    expect(readLastMode(memory())).toBeNull();
    expect(readLastMode(null)).toBeNull();
  });

  it("does not throw when storage is blocked (#431)", () => {
    expect(readLastMode(throwing)).toBeNull();
    expect(() => writeLastMode("queue", throwing)).not.toThrow();
  });
});
