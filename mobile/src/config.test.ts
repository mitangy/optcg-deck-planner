import { afterEach, describe, expect, it } from "vitest";
import { floatingPromptsEnabled } from "./config";

describe("floatingPromptsEnabled", () => {
  afterEach(() => {
    delete process.env.EXPO_PUBLIC_FLOATING_PROMPTS;
  });

  it("floats cards in live matches when nothing is configured", () => {
    delete process.env.EXPO_PUBLIC_FLOATING_PROMPTS;
    expect(floatingPromptsEnabled()).toBe(true);
  });

  it("goes back to the inline prompts when set to false", () => {
    process.env.EXPO_PUBLIC_FLOATING_PROMPTS = "false";
    expect(floatingPromptsEnabled()).toBe(false);
  });
});
