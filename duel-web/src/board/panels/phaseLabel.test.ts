import { describe, expect, it } from "vitest";
import { phaseLabel } from "./phaseLabel";

describe("HUD phase word (#276)", () => {
  it("never prints the engine's game_over id (#276)", () => {
    expect(phaseLabel("game_over")).toBe("Match over");
  });

  it("capitalizes a phase it has no word for (#276)", () => {
    expect(phaseLabel("some_new_phase")).toBe("Some new phase");
  });
});
