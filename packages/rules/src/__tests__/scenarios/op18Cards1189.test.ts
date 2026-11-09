/**
 * OP18 cards added from the Japanese card pages before TCGPlayer listed them (#1189): the six whose text needed
 * new engine or grammar support. Each row has a case where the behaviour must not apply, so loosening it fails on
 * its own scenario.
 */
import { describe, expect, it } from "vitest";
import { Harness } from "../../testing/harness.js";
import { runScenarios, mine, type CardScenario } from "../../testing/scenario.js";
import { powerOf } from "../../engine/queries.js";

const KAROO = "ST01-003"; // 3000 vanilla
const VIVI = "ST01-009"; // 4000 vanilla
const KOMACHIYO = "OP01-010"; // 3000 vanilla
const SPEED = "OP01-104"; // 3000 vanilla
const ROBIN = "OP01-017"; // 3000
const VIVI_LEADER = "OP04-001"; // Nefeltari Vivi
const LUFFY_LEADER = "ST01-001"; // Monkey.D.Luffy, 5000 power
const SPANDAM = "OP18-079";
const BASE_5000_A = "OP01-023"; // vanilla 5000 base power
const BASE_5000_B = "OP01-043"; // vanilla 5000 base power
const BASE_6000 = "OP01-018"; // vanilla 6000 base power
const BASE_8000 = "OP02-007"; // vanilla 8000 base power
const KAROO_7000 = "EB02-001"; // vanilla {Animal}{Alabasta}, 7000 base power
const YAMAKAJI = "OP18-112"; // {Vice Admiral}
const DOBERMAN = "OP18-106"; // {Vice Admiral}
const MOMONGA = "OP18-111"; // {Vice Admiral}

const rows: CardScenario[] = [
  // OP18-020 Stop Fighting!!!: [Counter] You may add all of your Life cards to your hand: If your Leader is [Nefeltari Vivi],
  // give your opponent's Leader and all of their Characters -5000 power during this turn.
  {
    card: "OP18-020", name: "adds all your Life cards to your hand and gives the opponent's Leader and every Character -5000 (#1189)",
    leaders: { me: VIVI_LEADER },
    me: { hand: ["OP18-020"], life: [KAROO, VIVI, SPEED], don: { active: 1 } },
    opp: { field: [KOMACHIYO, SPEED] },
    steps: [{ endTurn: true }, { attack: { seat: 1, card: KOMACHIYO }, at: "leader" }, { passBlock: true }, { counter: "OP18-020" }, { accept: true }],
    expect: {
      me: { hand: [KAROO, VIVI, SPEED], life: 0 },
      opp: { power: { [LUFFY_LEADER]: 0, [KOMACHIYO]: -2000, [SPEED]: -2000 } },
    },
  },
  {
    card: "OP18-020", name: "still takes the Life when your Leader is not [Nefeltari Vivi], and gives no -5000 (#1189)",
    leaders: { me: LUFFY_LEADER },
    me: { hand: ["OP18-020"], life: [KAROO, VIVI], don: { active: 1 } },
    opp: { field: [KOMACHIYO] },
    steps: [{ endTurn: true }, { attack: { seat: 1, card: KOMACHIYO }, at: "leader" }, { passBlock: true }, { counter: "OP18-020" }, { accept: true }],
    expect: {
      me: { hand: [KAROO, VIVI], life: 0 },
      opp: { power: { [LUFFY_LEADER]: 5000, [KOMACHIYO]: 3000 } },
    },
  },
  {
    card: "OP18-020", name: "can be paid with no Life cards left, since all of nothing is nothing (#1189)",
    leaders: { me: VIVI_LEADER },
    me: { hand: ["OP18-020"], life: [], don: { active: 1 } },
    opp: { field: [KOMACHIYO] },
    steps: [{ endTurn: true }, { attack: { seat: 1, card: KOMACHIYO }, at: "leader" }, { passBlock: true }, { counter: "OP18-020" }, { accept: true }],
    expect: { me: { hand: [], life: 0 }, opp: { power: { [LUFFY_LEADER]: 0, [KOMACHIYO]: -2000 } } },
  },

  // OP18-078 Mini-Merry: [Activate: Main] You may rest this Stage: Give up to 1 rested DON!! card each to a total of up to 4 of your Leader and Characters.
  {
    card: "OP18-078", name: "gives 1 rested DON!! each to 4 chosen Leader or Characters (#1189)",
    me: { stage: "OP18-078", field: [KAROO, VIVI, KOMACHIYO, SPEED, ROBIN], don: { active: 0, rested: 5 } },
    steps: [{ activate: mine("OP18-078"), ability: "op18-078#1" }, { pick: [LUFFY_LEADER, KAROO, VIVI, SPEED] }],
    expect: {
      me: {
        don: { rested: 1, attached: 4 },
        attached: { [LUFFY_LEADER]: 1, [KAROO]: 1, [VIVI]: 1, [SPEED]: 1, [KOMACHIYO]: 0, [ROBIN]: 0 },
      },
    },
  },
];

runScenarios("OP18 cards added from Japanese text (#1189)", rows);

describe("OP18-078 Mini-Merry picks at most 4 cards", () => {
  it("OP18-078 rejects a fifth target for the rested DON!! (#1189)", () => {
    const h = new Harness({ leaders: [LUFFY_LEADER, LUFFY_LEADER] });
    h.stage(0, "OP18-078");
    h.field(0, KAROO, VIVI, KOMACHIYO, SPEED, ROBIN);
    h.don(0, 0, 5);
    h.act(0, { type: "activate_ability", sourceId: h.find(0, "OP18-078")!.id, abilityId: "op18-078#1" });
    const request = h.choice!.request;
    if (request?.type !== "select") throw new Error("expected a select prompt");
    expect(request.max).toBe(4);
    const five = request.options.slice(0, 5).map((o) => o.id);
    expect(h.try(0, { type: "resolve_pending_choice", accept: true, selectedOptionIds: five }).ok).toBe(false);
  });
});

describe("OP18-027 Zoro & Sogeking", () => {
  // [Opponent's Turn] The base power of your active [Monkey.D.Luffy] Leader with 3 or more DON!! cards given becomes 7000.
  // Zoro & Sogeking belongs to seat 1, so seat 0's turn is its opponent's turn.
  const leaderPower = (setup: (h: Harness) => void, leader = LUFFY_LEADER): number => {
    const h = new Harness({ leaders: [LUFFY_LEADER, leader] });
    h.field(1, "OP18-027");
    setup(h);
    return powerOf(h.state, 1, h.state.players[1].leader);
  };

  it("sets a [Monkey.D.Luffy] Leader with 3 DON!! given to 7000 base power on the opponent's turn (#1189)", () => {
    expect(leaderPower((h) => h.attach(1, h.state.players[1].leader, 3))).toBe(7000);
  });

  it("does nothing with only 2 DON!! given (#1189)", () => {
    expect(leaderPower((h) => h.attach(1, h.state.players[1].leader, 2))).toBe(5000);
  });

  it("does nothing while the Leader is rested (#1189)", () => {
    expect(leaderPower((h) => { h.attach(1, h.state.players[1].leader, 3); h.state.players[1].leader.rested = true; })).toBe(5000);
  });

  it("does nothing for a Leader that is not [Monkey.D.Luffy] (#1189)", () => {
    expect(leaderPower((h) => h.attach(1, h.state.players[1].leader, 3), "OP02-001")).toBe(6000);
  });

  it("does nothing on its owner's own turn (#1189)", () => {
    const h = new Harness({ leaders: [LUFFY_LEADER, LUFFY_LEADER] });
    h.field(0, "OP18-027");
    // DON!! on your own turn add +1000 each: 5000 + 3000, not the 7000 base.
    h.attach(0, h.state.players[0].leader, 3);
    expect(powerOf(h.state, 0, h.state.players[0].leader)).toBe(8000);
  });
});

describe("OP18-061 Iceburg", () => {
  // [On Play] Look at 5 cards from the top of your deck; reveal a total of up to 2 Stage cards or {Water Seven} type cards
  // and add them to your hand. Then, place the rest at the bottom of your deck in any order.
  const MINI_MERRY = "EB01-011"; // Stage, {Straw Hat Crew}
  const KIWI_MOZU = "OP03-061"; // {Water Seven} Character
  const KOKORO = "OP03-062"; // {Water Seven} Character

  const play = () => {
    const h = new Harness({ leaders: [LUFFY_LEADER, LUFFY_LEADER] });
    h.don(0, 2, 0);
    h.hand(0, "OP18-061");
    h.deckTop(0, MINI_MERRY, KIWI_MOZU, KAROO, KOKORO, SPEED);
    h.play(0, "OP18-061");
    return h;
  };

  it("offers a Stage of any type and any {Water Seven} card, but nothing else (#1189)", () => {
    const h = play();
    const request = h.choice?.request;
    if (request?.type !== "look") throw new Error("expected a look prompt");
    expect(request.options.map((o) => [o.defId, o.eligible])).toEqual([
      [MINI_MERRY, true], [KIWI_MOZU, true], [KAROO, false], [KOKORO, true], [SPEED, false],
    ]);
  });

  it("adds the two chosen cards to the hand and puts the other three at the bottom of the deck (#1189)", () => {
    const h = play();
    const deckBefore = h.state.players[0].deck.length;
    h.pick(MINI_MERRY, KOKORO);
    const p = h.state.players[0];
    expect(p.hand.map((c) => c.defId).sort()).toEqual([MINI_MERRY, KOKORO].sort());
    expect(p.deck.length).toBe(deckBefore - 2);
    expect(p.deck.slice(-3).sort()).toEqual([KIWI_MOZU, KAROO, SPEED].sort());
  });

  it("does not let a third card be taken (#1189)", () => {
    const h = play();
    const ids = h.choice!.request!.type === "look" ? h.choice!.request!.options.filter((o) => o.eligible).map((o) => o.id) : [];
    expect(ids.length).toBe(3);
    expect(h.try(0, { type: "resolve_pending_choice", accept: true, selectedOptionIds: ids }).ok).toBe(false);
  });
});

describe("OP18-064 Saint Killingham", () => {
  // [Your Turn] [On Play] DON!! −1: Up to 1 of your opponent's Characters with 7000 base power or less and up to 1 of your
  // opponent's Characters with 5000 base power or less cannot attack until the end of your opponent's next End Phase.
  // The opponent's Leader OP18-001 gives {Animal}{Alabasta} Characters +1000, so KAROO_7000 has 8000 power but 7000 base power.
  const setup = () => {
    const h = new Harness({ leaders: [LUFFY_LEADER, "OP18-001"] });
    h.don(0, 6, 0);
    h.hand(0, "OP18-064");
    h.field(1, BASE_8000, BASE_6000, BASE_5000_A, BASE_5000_B, KAROO_7000);
    h.play(0, "OP18-064");
    // DON!! −1 is a cost: accept it, then pick the one DON!! to return.
    h.accept();
    const pay = h.choice!.request;
    if (pay?.type !== "select") throw new Error("expected the DON!! cost prompt");
    h.act(0, { type: "resolve_pending_choice", accept: true, selectedOptionIds: [pay.options[0]!.id] });
    return h;
  };
  const defIdsOffered = (h: Harness): string[] => {
    const request = h.choice?.request;
    if (request?.type !== "select") throw new Error("expected a select prompt");
    return request.options.filter((o) => o.eligible).map((o) => o.defId!).sort();
  };
  const attackersOnOpponentsTurn = (h: Harness): string[] => {
    h.act(0, { type: "end_turn" });
    return h.legal(1).flatMap((i) => (i.type === "declare_attack" ? [h.state.players[1].characters.find((c) => c.id === i.attackerId)?.defId ?? "leader"] : [])).sort();
  };

  it("offers 7000-or-less base power Characters first, then 5000-or-less ones (#1189)", () => {
    const h = setup();
    expect(defIdsOffered(h)).toEqual([BASE_5000_A, BASE_5000_B, BASE_6000, KAROO_7000].sort());
    h.pick(BASE_6000);
    expect(defIdsOffered(h)).toEqual([BASE_5000_A, BASE_5000_B].sort());
  });

  it("takes two different Characters: the second pick cannot be the first one (#1189)", () => {
    const h = setup();
    h.pick(BASE_5000_A);
    expect(defIdsOffered(h)).toEqual([BASE_5000_B]);
    h.pick(BASE_5000_B);
    // Both 5000s are locked; the 6000 and the 8000 can still attack on the opponent's next turn.
    expect(attackersOnOpponentsTurn(h)).toEqual([BASE_6000, BASE_8000, KAROO_7000, "leader"].sort());
  });

  it("locks a 6000 base power Character with the first pick and leaves the 5000s free (#1189)", () => {
    const h = setup();
    h.pick(BASE_6000);
    h.pick(BASE_5000_A);
    expect(attackersOnOpponentsTurn(h)).toEqual([BASE_5000_B, BASE_8000, KAROO_7000, "leader"].sort());
  });
});

describe("OP18-117 Buster Call", () => {
  // [Main] You may trash all of your Life cards: If your Leader is [Spandam], trash all Characters and play up to a total of 5
  // {Vice Admiral} type Character cards with different card names from your deck or trash. Then, shuffle your deck.
  const MARKERS = [KAROO, VIVI, KOMACHIYO, SPEED, ROBIN, BASE_5000_A, BASE_5000_B];
  const setup = (leader: string) => {
    const h = new Harness({ leaders: [leader, LUFFY_LEADER] });
    h.don(0, 10, 0);
    h.hand(0, "OP18-117");
    h.life(0, KAROO, VIVI, SPEED);
    h.field(0, ROBIN);
    h.field(1, KOMACHIYO, BASE_8000);
    h.trash(0, YAMAKAJI, YAMAKAJI, DOBERMAN);
    h.deckTop(0, MOMONGA, ...MARKERS);
    h.play(0, "OP18-117");
    h.accept();
    return h;
  };
  const offered = (h: Harness): [string, string][] => {
    const request = h.choice?.request;
    if (request?.type !== "select") throw new Error("expected a select prompt");
    return request.options.filter((o) => o.eligible).map((o) => [o.defId!, o.zone!] as [string, string]).sort();
  };

  it("Buster Call trashes all Characters and plays differently named Vice Admirals from the deck and the trash (#1189)", () => {
    const h = setup(SPANDAM);
    expect(offered(h)).toEqual([[DOBERMAN, "trash"], [MOMONGA, "deck"], [YAMAKAJI, "trash"], [YAMAKAJI, "trash"]].sort());
    h.pick(YAMAKAJI, DOBERMAN, MOMONGA);
    const [me, opp] = h.state.players;
    expect(me!.characters.map((c) => c.defId).sort()).toEqual([DOBERMAN, MOMONGA, YAMAKAJI].sort());
    expect(opp!.characters).toEqual([]);
    expect(opp!.trash.sort()).toEqual([KOMACHIYO, BASE_8000].sort());
    expect([...me!.trash].sort()).toEqual(["OP18-117", ROBIN, YAMAKAJI, KAROO, VIVI, SPEED].sort());
    expect(me!.life.length).toBe(0);
    expect(me!.hand).toEqual([]);
  });

  it("Buster Call refuses two Vice Admirals with the same card name (#1189)", () => {
    const h = setup(SPANDAM);
    const request = h.choice!.request;
    if (request?.type !== "select") throw new Error("expected a select prompt");
    const yamakaji = request.options.filter((o) => o.defId === YAMAKAJI).map((o) => o.id);
    expect(yamakaji.length).toBe(2);
    expect(h.try(0, { type: "resolve_pending_choice", accept: true, selectedOptionIds: yamakaji }).ok).toBe(false);
  });

  it("Buster Call shuffles the deck after playing (#1189)", () => {
    const h = setup(SPANDAM);
    const before = h.state.players[0].deck.slice(1, 1 + MARKERS.length);
    expect(before).toEqual(MARKERS);
    h.pick(MOMONGA);
    expect(h.state.players[0].deck.slice(0, MARKERS.length)).not.toEqual(MARKERS);
  });

  it("Buster Call pays the Life cost but does nothing else when your Leader is not [Spandam] (#1189)", () => {
    const h = setup(LUFFY_LEADER);
    expect(h.choice).toBeUndefined();
    const [me, opp] = h.state.players;
    expect(me!.life.length).toBe(0);
    expect([...me!.trash].sort()).toEqual([YAMAKAJI, YAMAKAJI, DOBERMAN, "OP18-117", KAROO, VIVI, SPEED].sort());
    expect(me!.characters.map((c) => c.defId)).toEqual([ROBIN]);
    expect(opp!.characters.map((c) => c.defId).sort()).toEqual([KOMACHIYO, BASE_8000].sort());
    expect(me!.deck[0]).toBe(MOMONGA);
  });
});
