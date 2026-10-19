import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTOMATION_GUEST_ID, getOrCreateGuestId } from "./guestId";

function memoryStorage() {
  const data: Record<string, string> = {};
  const setItem = vi.fn((k: string, v: string) => void (data[k] = v));
  return {
    data,
    setItem,
    getItem: (k: string) => data[k] ?? null,
    clear: () => {
      for (const k of Object.keys(data)) delete data[k];
    },
  };
}

describe("guest id", () => {
  let storage: ReturnType<typeof memoryStorage>;
  beforeEach(() => {
    storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("gives an automated browser the same fixed guest id every run and writes nothing (#447)", () => {
    vi.stubGlobal("navigator", { webdriver: true });
    expect(getOrCreateGuestId()).toBe(AUTOMATION_GUEST_ID);
    storage.clear();
    expect(getOrCreateGuestId()).toBe(AUTOMATION_GUEST_ID);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.data).toEqual({});
  });

  it("gives a normal browser a random id that is stored and reused (#447)", () => {
    vi.stubGlobal("navigator", { webdriver: false });
    const first = getOrCreateGuestId();
    expect(first).not.toBe(AUTOMATION_GUEST_ID);
    expect(first).toMatch(/^[a-zA-Z0-9_-]{8,64}$/);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(getOrCreateGuestId()).toBe(first);
    storage.clear();
    expect(getOrCreateGuestId()).not.toBe(first);
  });
});
