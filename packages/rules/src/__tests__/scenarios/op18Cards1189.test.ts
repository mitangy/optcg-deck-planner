import { describe, expect, it } from "vitest";
import { Harness } from "../../testing/harness.js";
import { runScenarios, mine, type CardScenario } from "../../testing/scenario.js";
import { powerOf } from "../../engine/queries.js";

const KAROO = "ST01-003";
const VIVI = "ST01-009";
const KOMACHIYO = "OP01-010";
const SPEED = "OP01-104";
const ROBIN = "OP01-017";
const VIVI_LEADER = "OP04-001";
const LUFFY_LEADER = "ST01-001";
const SPANDAM = "OP18-079";
const BASE_5000_A = "OP01-023";
const BASE_5000_B = "OP01-043";
const BASE_6000 = "OP01-018";
const BASE_8000 = "OP02-007";
const KAROO_7000 = "EB02-001";
const YAMAKAJI = "OP18-112";
const DOBERMAN = "OP18-106";
const MOMONGA = "OP18-111";

const rows: CardScenario[] = [
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

describe("OP18-020 Stop Fighting!!! with no Life cards", () => {
  it("Stop Fighting!!! does nothing when you have no Life cards (#1297)", () => {
    const h = new Harness({ leaders: [VIVI_LEADER, LUFFY_LEADER] });
    h.don(0, 1, 0);
    h.hand(0, "OP18-020");
    h.life(0);
    h.field(1, KOMACHIYO);
    h.act(0, { type: "end_turn" });
    h.attack(h.find(1, KOMACHIYO)!, "leader");
    h.act(0, { type: "pass_block" });
    h.act(0, { type: "counter_event", handIndex: 0 });
    // Life counts are public, so a cost that can't be paid is skipped without asking.
    expect(h.choice).toBeUndefined();
    expect(powerOf(h.state, 1, h.state.players[1].leader)).toBe(5000);
    expect(powerOf(h.state, 1, h.find(1, KOMACHIYO)!)).toBe(3000);
  });
});

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
  const MINI_MERRY = "EB01-011";
  const KIWI_MOZU = "OP03-061";
  const KOKORO = "OP03-062";

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
  const setup = () => {
    const h = new Harness({ leaders: [LUFFY_LEADER, "OP18-001"] });
    h.don(0, 6, 0);
    h.hand(0, "OP18-064");
    h.field(1, BASE_8000, BASE_6000, BASE_5000_A, BASE_5000_B, KAROO_7000);
    h.play(0, "OP18-064");
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

  it("Buster Call does nothing when you have no Life cards (#1297)", () => {
    const h = new Harness({ leaders: [SPANDAM, LUFFY_LEADER] });
    h.don(0, 10, 0);
    h.hand(0, "OP18-117");
    h.life(0);
    h.field(0, ROBIN);
    h.field(1, KOMACHIYO, BASE_8000);
    h.trash(0, YAMAKAJI, DOBERMAN);
    h.deckTop(0, MOMONGA, ...MARKERS);
    h.play(0, "OP18-117");
    // Life counts are public, so a cost that can't be paid is skipped without asking.
    expect(h.choice).toBeUndefined();
    const [me, opp] = h.state.players;
    expect(me!.characters.map((c) => c.defId)).toEqual([ROBIN]);
    expect(opp!.characters.map((c) => c.defId).sort()).toEqual([KOMACHIYO, BASE_8000].sort());
    expect(me!.trash).toContain("OP18-117");
    expect(me!.trash.filter((c) => c === YAMAKAJI || c === DOBERMAN).length).toBe(2);
  });
});
