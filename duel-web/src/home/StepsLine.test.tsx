import { describe, expect, it } from "vitest";
import { stepsLine } from "./StepsLine";

describe("home steps line (#1506)", () => {
  it("tells a guest to sign in to keep their record, and a signed-in player nothing of the sort (#1506)", () => {
    expect(stepsLine(true)).toEqual(["Pick a deck", "Play", "Sign in to keep your record"]);
    expect(stepsLine(false)).toEqual(["Pick a deck", "Play"]);
  });
});
