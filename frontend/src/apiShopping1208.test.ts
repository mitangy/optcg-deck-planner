// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

function captureUrl() {
  const urls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    urls.push(String(url));
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  });
  return urls;
}

afterEach(() => vi.unstubAllGlobals());

describe("api.shopping deck selection (#1208)", () => {
  it("asks for no decks with an empty list, and for every deck with none", async () => {
    const urls = captureUrl();
    await api.shopping([]);
    await api.shopping(undefined);
    await api.shopping([2, 5]);
    const query = (u: string) => new URL(u, "http://x").searchParams;
    expect(query(urls[0]!).get("no_decks")).toBe("true");
    expect(query(urls[0]!).getAll("deck_ids")).toEqual([]);
    expect(query(urls[1]!).has("no_decks")).toBe(false);
    expect(query(urls[2]!).get("no_decks")).toBeNull();
    expect(query(urls[2]!).getAll("deck_ids")).toEqual(["2", "5"]);
  });
});
