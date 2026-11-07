import { describe, expect, it } from "vitest";
import { createAnalyticsBeforeSend, redactAnalyticsUrl } from "./analytics";

const TOKEN_ROUTES = ["/share/", "/group-buy/join/"];

describe("redactAnalyticsUrl", () => {
  it("replaces the token segment after a listed prefix", () => {
    expect(redactAnalyticsUrl("https://x.app/share/abc123", TOKEN_ROUTES)).toBe("https://x.app/share/[token]");
    expect(redactAnalyticsUrl("https://x.app/group-buy/join/tok9", TOKEN_ROUTES)).toBe("https://x.app/group-buy/join/[token]");
  });

  it("keeps a path that has no token after the prefix", () => {
    expect(redactAnalyticsUrl("https://x.app/share/", TOKEN_ROUTES)).toBe("https://x.app/share/");
  });

  it("drops query strings and hashes", () => {
    expect(redactAnalyticsUrl("https://x.app/decks/4?edit=1#top")).toBe("https://x.app/decks/4");
  });

  it("drops invite codes and auth tokens", () => {
    expect(redactAnalyticsUrl("https://optcgduel.app/?join=ROOM42")).toBe("https://optcgduel.app/");
    expect(redactAnalyticsUrl("https://optcgduel.app/auth/complete#token=secret")).toBe("https://optcgduel.app/auth/complete");
  });
});

describe("createAnalyticsBeforeSend", () => {
  it("rewrites the event url and keeps the other fields", () => {
    const beforeSend = createAnalyticsBeforeSend(TOKEN_ROUTES);
    expect(beforeSend({ url: "https://x.app/share/abc?x=1", type: "pageview" })).toEqual({
      url: "https://x.app/share/[token]",
      type: "pageview",
    });
  });
});
