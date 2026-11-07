import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCurrentEvent, fetchEventById, joinEvent } from "./eventApi";

afterEach(() => vi.unstubAllGlobals());

function answer(status: number, body: unknown) {
  const f = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", f);
  return f;
}

describe("event calls (refactor 2.1b)", () => {
  it("reads the current event, or null when there is none", async () => {
    answer(200, { event: null });
    expect(await fetchCurrentEvent()).toBeNull();
  });

  it("treats an unknown event id as null but any other failure as an error", async () => {
    answer(404, { detail: "no such event" });
    expect(await fetchEventById("nope")).toBeNull();
    answer(500, {});
    await expect(fetchEventById("nope")).rejects.toThrow("Request failed (500)");
  });

  it("joins with the accepted rules version and shows the server's reason when it refuses", async () => {
    const f = answer(200, {});
    await joinEvent("e 1", "v3");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/duel\/events\/e%201\/join$/);
    expect(JSON.parse(init.body as string)).toEqual({ accept_rules: true, rules_version: "v3" });
    answer(409, { detail: "The rules changed. Reload and read them again." });
    await expect(joinEvent("e1", "v2")).rejects.toThrow("The rules changed. Reload and read them again.");
    answer(500, {});
    await expect(joinEvent("e1", "v2")).rejects.toThrow("Could not join (500)");
  });
});
