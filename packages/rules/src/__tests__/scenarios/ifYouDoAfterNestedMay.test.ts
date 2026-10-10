/**
 * "If that card is X, you may play that card. If you do, Y" (ST13-007, ST13-010, ST13-014): Y happens only when the
 * card was really played. The "you may" sits inside the "If that card is X" clause, so the payoff has to ask
 * `_affected` instead of trusting that the prompt was accepted (#213 did this for a "you may" at the top level).
 */
import { describe, expect, it } from "vitest";
import { addModifier } from "../../engine/modifiers.js";
import { powerOf } from "../../engine/queries.js";
import { FILLER, Harness } from "../../testing/harness.js";

/** `revealed` is the cost-5 card of the same name that sits on top of Life. */
const CASES = [
  { card: "ST13-007", name: "Sabo", revealed: "ST13-008" },
  { card: "ST13-010", name: "Portgas.D.Ace", revealed: "ST13-011" },
  { card: "ST13-014", name: "Monkey.D.Luffy", revealed: "ST13-015" },
];

function setUp(card: string, revealed: string, opts: { cannotPlay: boolean; decline?: boolean }) {
  const h = new Harness();
  const [source] = h.field(0, card);
  h.life(0, revealed, FILLER);
  if (opts.cannotPlay) addModifier(h.state, 0, undefined, { kind: "player", seat: 0 }, { type: "player_restrict", restriction: "cannot_play_characters" }, { kind: "permanent" });
  h.act(0, { type: "activate_ability", sourceId: source!.id, abilityId: `${card.toLowerCase()}#0` });
  if (opts.decline) h.decline(); else h.accept();
  // The played Character's own [On Play] may ask something; this test is about the Leader.
  while (h.choice?.request?.type === "confirm") h.decline();
  h.forced();
  // "Up to 1 of your Leader": the payoff asks which card gets the power.
  if (h.choice?.request?.type === "select") h.pick(h.state.players[0].leader.id);
  return h;
}

describe.each(CASES)("$card $name: play the revealed Life card, then the Leader gets +2000", ({ card, revealed }) => {
  it(`${card} accept: playing the revealed card gives the Leader +2000 (#519)`, () => {
    const h = setUp(card, revealed, { cannotPlay: false });
    expect(h.state.players[0].characters.map((c) => c.defId)).toEqual([revealed]);
    expect(h.state.players[0].life).toEqual([FILLER]);
    expect(powerOf(h.state, 0, h.state.players[0].leader)).toBe(5000 + 2000);
  });

  it(`${card} accept but the play cannot happen: no +2000 (#519)`, () => {
    const h = setUp(card, revealed, { cannotPlay: true });
    expect(h.state.players[0].characters).toEqual([]);
    expect(powerOf(h.state, 0, h.state.players[0].leader)).toBe(5000);
  });

  it(`${card} decline: the revealed card stays in Life and the Leader gets nothing (#519)`, () => {
    const h = setUp(card, revealed, { cannotPlay: false, decline: true });
    expect(h.state.players[0].characters).toEqual([]);
    expect(h.state.players[0].life).toEqual([revealed, FILLER]);
    expect(powerOf(h.state, 0, h.state.players[0].leader)).toBe(5000);
  });
});
