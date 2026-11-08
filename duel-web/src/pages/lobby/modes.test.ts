import { describe, expect, it } from "vitest";
import { confirmLabel, modeTitle } from "./modes";

describe("Play sheet copy (refactor 3.4a)", () => {
  it("Create and Join share the Private room heading but each confirms in its own words", () => {
    expect(modeTitle("create")).toBe("Private room");
    expect(modeTitle("join")).toBe("Private room");
    expect(confirmLabel("create")).toBe("Create room");
    expect(confirmLabel("join")).toBe("Join room");
  });

  it("the sheet is headed Play until a mode is chosen", () => {
    expect(modeTitle(null)).toBe("Play");
  });

  it("the ranked and bot sheets confirm with their own labels", () => {
    expect(confirmLabel("queue")).toBe("Find match");
    expect(confirmLabel("bot")).toBe("Start game");
  });
});
