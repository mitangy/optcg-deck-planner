import { describe, expect, it } from "vitest";
import { promptBody } from "./promptText";

describe("promptBody (#276)", () => {
  it("drops the card name the sheet already shows as its title (#276)", () => {
    expect(promptBody("Zehahahahaha!", "Zehahahahaha! — add the top card of your deck to Life.")).toBe(
      "add the top card of your deck to Life.",
    );
  });

  it("keeps a sentence that merely mentions another name, or is only the name (#276)", () => {
    expect(promptBody("Effect", "Choose a card.")).toBe("Choose a card.");
    expect(promptBody("Lucy", "Lucy — ")).toBe("Lucy — ");
  });
});
