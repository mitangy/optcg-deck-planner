import { describe, expect, it } from "vitest";
import { analyticsBeforeSend } from "./analytics";

const sent = (url: string) => analyticsBeforeSend({ url }).url;

describe("planner analytics scrubber", () => {
  it("replaces public share and group-buy tokens", () => {
    expect(sent("https://x.app/share/abc123")).toBe("https://x.app/share/[token]");
    expect(sent("https://x.app/group-buy/join/tok9")).toBe("https://x.app/group-buy/join/[token]");
    expect(sent("https://x.app/group-buy/view/tok9")).toBe("https://x.app/group-buy/view/[token]");
  });

  it("drops query strings and hashes", () => {
    expect(sent("https://x.app/decks/4?edit=1#top")).toBe("https://x.app/decks/4");
  });
});
