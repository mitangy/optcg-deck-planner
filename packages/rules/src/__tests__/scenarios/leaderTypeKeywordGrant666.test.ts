import { describe, expect, it } from "vitest";
import { cardDataFor } from "../../cards/cardData.js";
import { compileCardText } from "../../tools/cardText/compileCard.js";
import { runScenarios, type CardScenario } from "../../testing/scenario.js";

const MR1 = "OP18-047";
const BUGGY = "OP09-042";
const ALL_SUNDAY = "OP18-041";
const LUFFY = "ST01-001";

describe("leader-type keyword grant compiles (#666)", () => {
  it("OP18-047 compiles to an if on Cross Guild or a type including Baroque Works, granting your Leader Unblockable this turn (#666)", () => {
    const out = compileCardText(MR1, cardDataFor(MR1)!);
    expect(out.status).toBe("supported");
    expect(out.unsupported).toEqual([]);
    const [ability] = out.abilities as any[];
    expect(ability.trigger).toBe("on_play");
    expect(ability.effect).toEqual({
      do: "if",
      cond: { c: "or", conds: [{ c: "leader_trait", traits: ["Cross Guild"] }, { c: "leader_trait_includes", text: "Baroque Works" }] },
      then: { do: "keyword", target: { ref: "leader", player: "you" }, keyword: "unblockable", duration: "turn" },
    });
  });
});

const rows: CardScenario[] = [
  {
    card: MR1, name: "On Play gives a {Cross Guild} Leader [Unblockable] (#666)",
    leaders: { me: BUGGY },
    me: { hand: [MR1] },
    steps: [{ play: MR1 }],
    expect: { me: { keywords: { [BUGGY]: ["unblockable"] } }, pending: "none" },
  },
  {
    card: MR1, name: "On Play gives a Leader with a type including \"Baroque Works\" [Unblockable] (#666)",
    leaders: { me: ALL_SUNDAY },
    me: { hand: [MR1] },
    steps: [{ play: MR1 }],
    expect: { me: { keywords: { [ALL_SUNDAY]: ["unblockable"] } }, pending: "none" },
  },
  {
    card: MR1, name: "On Play gives a Leader with neither type nothing (#666)",
    leaders: { me: LUFFY },
    me: { hand: [MR1] },
    steps: [{ play: MR1 }],
    expect: { me: { keywords: { [LUFFY]: [] } }, pending: "none" },
  },
];

runScenarios("leader-type keyword grant scenarios (#666)", rows);
