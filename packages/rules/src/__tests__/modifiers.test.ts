import { describe, expect, it } from "vitest";
import { isNegated, powerOf } from "../engine/queries.js";
import { Harness } from "../testing/harness.js";

// Static modifiers: negation applied through selectors and a negated Character's own statics.

const KAROO = "ST01-003"; // vanilla 1-cost {Animal}/{Alabasta}

describe("a static \"have their effects negated\" on a selector", () => {
  const ROGER = "OP13-064"; // Your Leader and all of your Characters that do not have a type including "Roger Pirates" have their effects negated.

  it("negates your Leader and your other Characters, but not a Roger Pirates Character or the opponent's cards (#753)", () => {
    const h = new Harness();
    const [mine, roger] = h.field(0, KAROO, ROGER);
    const [theirs] = h.field(1, KAROO);
    expect(isNegated(h.state, mine!)).toBe(true);
    expect(isNegated(h.state, h.state.players[0].leader)).toBe(true);
    expect(isNegated(h.state, roger!)).toBe(false);
    expect(isNegated(h.state, theirs!)).toBe(false);
    expect(isNegated(h.state, h.state.players[1].leader)).toBe(false);
  });
});

describe("a negated Character's own static abilities", () => {
  const SANJI = "OP12-070"; // 3-cost 5000. This Character gains +1000 power for every 5 Events in your trash.
  const ROGER = "OP13-064"; // Your Leader and all of your Characters that do not have a type including "Roger Pirates" have their effects negated.
  const GUARD_POINT = "ST01-014"; // Event

  function sanjiPower(withRoger: boolean): number {
    const h = new Harness();
    const [sanji] = h.field(0, SANJI);
    if (withRoger) h.field(0, ROGER);
    h.trash(0, ...Array<string>(5).fill(GUARD_POINT));
    return powerOf(h.state, 0, sanji!);
  }

  it("keep applying while the Character is not negated and stop once it is (#861)", () => {
    expect(sanjiPower(false)).toBe(6000);
    expect(sanjiPower(true)).toBe(5000);
  });
});
