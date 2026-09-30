import { describe, expect, it } from "vitest";
import { redactAnalyticsUrl } from "./analytics";

describe("redactAnalyticsUrl", () => {
  it("replaces public share and group-buy tokens", () => {
    expect(redactAnalyticsUrl("https://x.app/share/abc123")).toBe("https://x.app/share/[token]");
    expect(redactAnalyticsUrl("https://x.app/group-buy/join/tok9")).toBe("https://x.app/group-buy/join/[token]");
    expect(redactAnalyticsUrl("https://x.app/group-buy/view/tok9")).toBe("https://x.app/group-buy/view/[token]");
  });

  it("drops query strings and hashes", () => {
    expect(redactAnalyticsUrl("https://x.app/decks/4?edit=1#top")).toBe("https://x.app/decks/4");
  });
});
