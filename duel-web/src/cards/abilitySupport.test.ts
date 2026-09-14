import { describe, expect, it } from "vitest";
import {
  abilitySupportNote,
  resolveAbilitySupport,
} from "./abilitySupport";

describe("resolveAbilitySupport", () => {
  it("prefers atlas abilitySupport when present", () => {
    expect(
      resolveAbilitySupport({
        effectText: "[On Play] Draw 1 card.",
        abilitySupport: "ok",
      }),
    ).toBe("ok");
  });

  it("returns none for empty / dash text without keywords", () => {
    expect(resolveAbilitySupport({ effectText: "—" })).toBe("none");
    expect(resolveAbilitySupport({ effectText: "" })).toBe("none");
    expect(resolveAbilitySupport({})).toBe("none");
  });

  it("returns keywords for blocker/rush-only text", () => {
    expect(
      resolveAbilitySupport({
        effectText:
          "[Blocker] (After your opponent declares an attack, you may rest this card to make it the new target of the attack.)",
        blocker: true,
      }),
    ).toBe("keywords");
    expect(
      resolveAbilitySupport({
        effectText: "[Rush] (This card can attack on the turn in which it is played.)",
        rush: true,
      }),
    ).toBe("keywords");
  });

  it("returns unsupported for On Play and other clauses", () => {
    expect(
      resolveAbilitySupport({
        effectText: "[On Play] Draw 1 card.",
      }),
    ).toBe("unsupported");
    expect(
      resolveAbilitySupport({
        effectText:
          "[Blocker]\n[On Play] If you have 2 or less Life cards, add up to 1 card from the top of your deck to the top of your Life cards.",
        blocker: true,
      }),
    ).toBe("unsupported");
  });

  it("exposes inspect note only for unsupported/partial", () => {
    expect(abilitySupportNote("unsupported")).toMatch(/Not implemented/);
    expect(abilitySupportNote("partial")).toMatch(/Not implemented/);
    expect(abilitySupportNote("ok")).toBeNull();
    expect(abilitySupportNote("keywords")).toBeNull();
    expect(abilitySupportNote("none")).toBeNull();
  });
});
