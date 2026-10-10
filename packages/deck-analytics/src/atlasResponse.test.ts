import { describe, expect, it } from "vitest";
import { StaleAtlasError, parseAtlasResponse } from "./atlasResponse";

const html = () => new Response("<!doctype html><html></html>", { status: 200, headers: { "content-type": "text/html" } });

describe("deck stats atlas response (#516)", () => {
  it("an HTML 200 from the SPA fallback is a stale build, not a JSON parse error (#516)", async () => {
    const err = await parseAtlasResponse(html()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StaleAtlasError);
    expect((err as Error).message).toBe("Deck stats were updated. Reload the page to load them.");
    expect((err as Error).message).not.toContain("Unexpected token");
  });

  it("a 404 for the old hashed file is a stale build (#516)", async () => {
    await expect(parseAtlasResponse(new Response("nope", { status: 404 }))).rejects.toBeInstanceOf(StaleAtlasError);
  });

  it("a body that is not JSON under a JSON content type is a stale build (#516)", async () => {
    const res = new Response("<html>", { status: 200, headers: { "content-type": "application/json" } });
    await expect(parseAtlasResponse(res)).rejects.toBeInstanceOf(StaleAtlasError);
  });

  it("a server error keeps the status message and is not stale (#516)", async () => {
    const err = await parseAtlasResponse(new Response("boom", { status: 500 })).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(StaleAtlasError);
    expect((err as Error).message).toBe("Card stats unavailable (500)");
  });

  it("a JSON 200 returns the parsed atlas (#516)", async () => {
    const res = new Response(JSON.stringify({ "OP01-001": { n: "Zoro" } }), { status: 200, headers: { "content-type": "application/json" } });
    await expect(parseAtlasResponse(res)).resolves.toEqual({ "OP01-001": { n: "Zoro" } });
  });
});
