import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchMatchReplay, ReplayLoadError } from "./replayApi";

afterEach(() => vi.unstubAllGlobals());

const reason = async (p: Promise<unknown>) => {
  const e = (await p.catch((x: unknown) => x)) as ReplayLoadError;
  return { reason: e.reason, message: e.message };
};

describe("loading a replay (refactor 2.1b)", () => {
  it("returns the recording", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ match_id: "m1" }), { status: 200 }));
    expect(await fetchMatchReplay("m1")).toEqual({ match_id: "m1" });
  });

  it("names why it could not: signed out, unknown, still being played, or another error", async () => {
    for (const [status, why] of [[401, "signed-out"], [404, "not-found"], [409, "in-progress"], [500, "error"]] as const) {
      vi.stubGlobal("fetch", async () => new Response("{}", { status }));
      expect((await reason(fetchMatchReplay("m1"))).reason).toBe(why);
    }
  });

  it("words a refusal with the server's message, else 'Could not load this replay (status)'", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ detail: "Not your match" }), { status: 404 }));
    expect((await reason(fetchMatchReplay("m1"))).message).toBe("Not your match");
    vi.stubGlobal("fetch", async () => new Response("oops", { status: 502 }));
    expect((await reason(fetchMatchReplay("m1"))).message).toBe("Could not load this replay (502)");
  });

  it("says it could not reach the server when the request itself fails", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("offline");
    });
    expect(await reason(fetchMatchReplay("m1"))).toEqual({ reason: "error", message: "Could not reach the server" });
  });
});
