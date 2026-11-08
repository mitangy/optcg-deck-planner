import { afterEach, describe, expect, it, vi } from "vitest";
import { ackWarning, fetchWarnings } from "./warningsApi";

afterEach(() => vi.unstubAllGlobals());

const answer = (status: number, body: unknown = []) => vi.stubGlobal("fetch", async () => new Response(JSON.stringify(body), { status }));

describe("player warnings are best effort (refactor 2.1b)", () => {
  it("lists the warnings the server sent and drops malformed ones", async () => {
    answer(200, [{ id: 1, message: "Be kind", created_at: "x" }, { id: "2", message: "bad" }, null]);
    expect(await fetchWarnings()).toEqual([{ id: 1, message: "Be kind", created_at: "x" }]);
  });

  it("is an empty list, not an error, when the server refuses", async () => {
    answer(401, { detail: "not signed in" });
    expect(await fetchWarnings()).toEqual([]);
  });

  it("lets a network failure through for the caller to ignore", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("offline");
    });
    await expect(fetchWarnings()).rejects.toThrow("offline");
  });

  it("ignores a refused acknowledgement but not a network failure", async () => {
    answer(500, { detail: "boom" });
    await expect(ackWarning(3)).resolves.toBeUndefined();
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("offline");
    });
    await expect(ackWarning(3)).rejects.toThrow("offline");
  });
});
