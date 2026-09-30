import { describe, expect, it } from "vitest";
import { redactAnalyticsUrl } from "./analytics";

describe("redactAnalyticsUrl", () => {
  it("drops invite codes and auth tokens", () => {
    expect(redactAnalyticsUrl("https://optcgduel.app/?join=ROOM42")).toBe("https://optcgduel.app/");
    expect(redactAnalyticsUrl("https://optcgduel.app/auth/complete#token=secret")).toBe(
      "https://optcgduel.app/auth/complete",
    );
  });
});
