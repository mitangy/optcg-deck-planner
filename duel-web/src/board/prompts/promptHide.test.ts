import { describe, expect, it } from "vitest";
import { isPromptHidden, promptOpenFor } from "./promptHide";

describe("isPromptHidden", () => {
  it("keeps the pop-up hidden for the choice it was hidden on", () => {
    expect(isPromptHidden("c1", "c1")).toBe(true);
  });

  it("shows the next choice even though the last one was hidden", () => {
    expect(isPromptHidden("c1", "c2")).toBe(false);
  });
});

describe("promptOpenFor", () => {
  it("is open for your own visible choice, so the battle arrow fades (#278)", () => {
    expect(promptOpenFor({ id: "c1", seat: 0 }, 0, null)).toBe(true);
    expect(promptOpenFor({ id: "c2", seat: 0 }, 0, "c1")).toBe(true);
  });

  it("is not open for the opponent's choice (#278)", () => {
    expect(promptOpenFor({ id: "c1", seat: 1 }, 0, null)).toBe(false);
  });

  it("is not open once you tuck your prompt away (#278)", () => {
    expect(promptOpenFor({ id: "c1", seat: 0 }, 0, "c1")).toBe(false);
  });
});
