import { describe, expect, it } from "vitest";
import { isPromptHidden } from "./promptHide";

describe("isPromptHidden", () => {
  it("keeps the pop-up hidden for the choice it was hidden on", () => {
    expect(isPromptHidden("c1", "c1")).toBe(true);
  });

  it("shows the next choice even though the last one was hidden", () => {
    expect(isPromptHidden("c1", "c2")).toBe(false);
  });
});
