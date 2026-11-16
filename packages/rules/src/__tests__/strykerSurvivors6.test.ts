import { describe, expect, it } from "vitest";
import { getPlayerView, getSpectatorView } from "../engine.js";
import { FILLER, Harness } from "../testing/harness.js";
import type { CardInstance } from "../types.js";

// Weekly Stryker survivors 2026-11-16.

const SPANDAM_LEADER = "OP18-079"; // [Spandam] Leader (Buster Call needs it)
const VIVI_LEADER = "OP04-001"; // [Nefeltari Vivi] Leader (Stop Fighting!!! needs it)
const CP_LEADER = "OP03-076"; // Rob Lucci, {CP9} Leader (OP18-105's Trigger needs a "CP" type)
const BUSTER_CALL = "OP18-117";
const STOP_FIGHTING = "OP18-020";
const SPANDAM_STAGE_CHAR = "OP18-105";

const attackLeader = (h: Harness) => h.act(0, { type: "declare_attack", attackerId: h.state.players[0].leader.id, target: { kind: "leader" } });
const canAttack = (h: Harness, seat: 0 | 1, card: CardInstance) => h.legal(seat).some((i) => i.type === "declare_attack" && i.attackerId === card.id);

describe("Buster Call plays from deck or trash (H1)", () => {
  function busterCall(opts: { trash: string[]; deck?: string[] }) {
    const h = new Harness({ leaders: [SPANDAM_LEADER, "ST01-001"] });
    h.life(0, FILLER, FILLER);
    h.hand(0, BUSTER_CALL);
    h.don(0, 10);
    if (opts.trash.length) h.trash(0, ...opts.trash);
    if (opts.deck?.length) h.deckTop(0, ...opts.deck);
    h.play(0, BUSTER_CALL);
    h.accept();
    return h;
  }

  it("OP18-117 still asks which Vice Admirals to play when none are in the deck or trash, so the opponent cannot tell (#PRNUM)", () => {
    const h = busterCall({ trash: [FILLER] });
    expect(h.choice).toBeDefined();
    expect(h.choice!.seat).toBe(0);
    expect(h.choice!.request).toMatchObject({ type: "select", min: 0, max: 0 });
    expect(h.choice!.privateToSeat).toBe(0);
  });
});

describe("\"all of your Life\" costs (R1)", () => {
  /** Seat 1 holds OP18-020 [Counter] with a [Nefeltari Vivi] Leader: the cost is "add all of your Life cards to your hand". */
  function stopFighting(life: string[]) {
    const h = new Harness({ leaders: ["ST01-001", VIVI_LEADER] });
    h.life(1, ...life);
    h.hand(1, STOP_FIGHTING);
    h.don(1, 1);
    attackLeader(h);
    h.act(1, { type: "pass_block" });
    return h;
  }

  it("OP18-020 Stop Fighting!!! can be paid with exactly 1 Life and moves it to hand (#PRNUM)", () => {
    const h = stopFighting(["ST01-004"]);
    h.act(1, { type: "counter_event", handIndex: 0 });
    h.accept();
    expect(h.state.players[1].life).toEqual([]);
    expect(h.state.players[1].hand.map((c) => c.defId)).toEqual(["ST01-004"]);
  });

  it("OP18-020 Stop Fighting!!! with no Life cannot pay its cost: it is not offered and the attacker keeps its power (#PRNUM)", () => {
    const h = stopFighting([]);
    const before = getPlayerView(h.state, 0).you.leader.power;
    h.act(1, { type: "counter_event", handIndex: 0 });
    expect(h.choice).toBeUndefined();
    expect(getPlayerView(h.state, 0).you.leader.power).toBe(before);
  });

  it("OP18-020 Stop Fighting!!! with 1 Life pays the cost and gives the attacking Leader -5000 (#PRNUM)", () => {
    const h = stopFighting(["ST01-004"]);
    const before = getPlayerView(h.state, 0).you.leader.power;
    h.act(1, { type: "counter_event", handIndex: 0 });
    h.accept();
    expect(getPlayerView(h.state, 0).you.leader.power).toBe(before - 5000);
  });

  it("OP18-020 Stop Fighting!!! moves every Life card to hand, not just the top one (#PRNUM)", () => {
    const h = stopFighting(["ST01-004", "ST01-005", "ST01-006"]);
    h.act(1, { type: "counter_event", handIndex: 0 });
    h.accept();
    expect(h.state.players[1].life).toEqual([]);
    expect(h.state.players[1].hand.map((c) => c.defId).sort()).toEqual(["ST01-004", "ST01-005", "ST01-006"]);
  });

  it("OP18-117 Buster Call can be paid with exactly 1 Life and trashes it (#PRNUM)", () => {
    const h = new Harness({ leaders: [SPANDAM_LEADER, "ST01-001"] });
    h.life(0, "ST01-004");
    h.hand(0, BUSTER_CALL);
    h.don(0, 10);
    expect(h.legal(0).some((i) => i.type === "play_card")).toBe(true);
    h.play(0, BUSTER_CALL);
    h.accept();
    expect(h.state.players[0].life).toEqual([]);
    expect(h.state.players[0].trash).toContain("ST01-004");
  });

  it("OP18-117 Buster Call trashes every Life card (#PRNUM)", () => {
    const h = new Harness({ leaders: [SPANDAM_LEADER, "ST01-001"] });
    h.life(0, "ST01-004", "ST01-005", "ST01-006");
    h.hand(0, BUSTER_CALL);
    h.don(0, 10);
    h.play(0, BUSTER_CALL);
    h.accept();
    expect(h.state.players[0].life).toEqual([]);
    expect(["ST01-004", "ST01-005", "ST01-006"].every((d) => h.state.players[0].trash.includes(d))).toBe(true);
  });
});

describe("OP18-105 Spandam activates the [Trigger] of a revealed card (R2)", () => {
  const SIX_KING = "OP03-096"; // {CP9} Event, [Trigger] Draw 2 cards
  const FUKUROU = "OP03-088"; // {CP9} Character with no [Trigger]

  /** Seat 1 (CP9 Leader) has OP18-105 as its top Life card and takes a hit; its [Trigger] is activated. */
  function spandamTrigger(hand: string[]) {
    const h = new Harness({ leaders: ["ST01-001", CP_LEADER] });
    h.life(1, SPANDAM_STAGE_CHAR, FILLER);
    h.hand(1, ...hand);
    attackLeader(h);
    h.act(1, { type: "pass_block" });
    h.act(1, { type: "pass_counter" });
    expect(h.choice?.kind).toBe("life_trigger");
    h.accept();
    return h;
  }
  const deckSize = (h: Harness) => h.state.players[1].deck.length;

  it("revealing a card with a [Trigger] activates it (#PRNUM)", () => {
    const h = spandamTrigger([SIX_KING]);
    const deck = deckSize(h);
    h.pick(SIX_KING);
    expect(h.choice).toBeUndefined();
    expect(h.state.players[1].hand.length).toBe(3);
    expect(deckSize(h)).toBe(deck - 2);
  });

  it("revealing a card without a [Trigger] does nothing (#PRNUM)", () => {
    const h = spandamTrigger([FUKUROU]);
    const deck = deckSize(h);
    expect(() => h.pick(FUKUROU)).not.toThrow();
    expect(h.choice).toBeUndefined();
    expect(h.state.players[1].hand.map((c) => c.defId)).toEqual([FUKUROU]);
    expect(deckSize(h)).toBe(deck);
  });
});

describe("a `not` condition is the opposite of its inner condition (R3)", () => {
  const LAW = "EB04-005"; // cannot attack unless the opponent has 2+ Characters with 5000+ base power
  const EMET = "EB04-051"; // cannot attack unless there is a Character with 12000+ base power
  const JINBE = "ST01-005"; // 5000 base power
  const ROBIN = "ST01-008"; // 5000 base power
  const SANJI = "ST01-004"; // 4000 base power
  const KAIDO = "OP01-094"; // 12000 base power

  it("EB04-005 Law attacks only once the opponent has two Characters with 5000+ base power (#PRNUM)", () => {
    const attackable = (opp: string[]) => {
      const h = new Harness();
      const [law] = h.field(0, LAW);
      h.field(1, ...opp);
      return canAttack(h, 0, law!);
    };
    expect(attackable([])).toBe(false);
    expect(attackable([JINBE, SANJI])).toBe(false);
    expect(attackable([JINBE, ROBIN])).toBe(true);
  });

  it("EB04-051 Emet attacks only while some Character on either side has 12000+ base power (#PRNUM)", () => {
    const attackable = (mine: string[], opp: string[]) => {
      const h = new Harness();
      const [emet] = h.field(0, EMET, ...mine);
      h.field(1, ...opp);
      return canAttack(h, 0, emet!);
    };
    expect(attackable([], [])).toBe(false);
    expect(attackable([], [JINBE])).toBe(false);
    expect(attackable([], [KAIDO])).toBe(true);
    expect(attackable([KAIDO], [])).toBe(true);
  });
});

describe("effects that choose a Stage find it on the field (R4)", () => {
  it("OP05-104 Conis places the Stage at the bottom of the deck as its cost, then draws and trashes (#PRNUM)", () => {
    const STAGE = "OP15-057";
    const h = new Harness();
    h.hand(0, "OP05-104");
    h.don(0, 1);
    const stage = h.stage(0, STAGE);
    h.play(0, "OP05-104");
    h.accept();
    h.forced();
    const p = h.state.players[0];
    expect(p.stage).toBeNull();
    expect(p.deck[p.deck.length - 1]).toBe(STAGE);
    expect(p.zoneInstanceIds.deck[p.zoneInstanceIds.deck.length - 1]).toBe(stage.id);
  });

  it("OP02-118 Yasakani Sacred Jewel's [Trigger] K.O.s the attacker's Stage with a cost of 3 or less (#PRNUM)", () => {
    const h = new Harness();
    h.stage(0, "OP15-057"); // cost 1
    h.life(1, "OP02-118", FILLER);
    attackLeader(h);
    h.act(1, { type: "pass_block" });
    h.act(1, { type: "pass_counter" });
    h.accept();
    h.pick("OP15-057");
    expect(h.state.players[0].stage).toBeNull();
    expect(h.state.players[0].trash).toContain("OP15-057");
  });
});

describe("trash rows carry art-copy ranks (V1)", () => {
  const SLEEPTIDS = "OP18-093"; // any number of copies allowed in a deck

  it("a trash mixing an any-number card and an ordinary card still reports ranks, null for the ordinary one (#PRNUM)", () => {
    const h = new Harness();
    h.trash(0, FILLER, SLEEPTIDS);
    const ranks = h.view(0).you.trashCopies;
    expect(ranks).toHaveLength(2);
    expect(ranks![0]).toBeNull();
    expect(ranks![1]).toEqual(expect.any(Number));
  });

  it("a spectator of a reveal-hands room ranks a played copy among the shown hand copies too (#PRNUM)", () => {
    const h = new Harness();
    h.hand(1, SLEEPTIDS); // dealt before the field copy, so it ranks first once hands are shown
    h.field(1, SLEEPTIDS);
    const field = (revealHands: boolean) => getSpectatorView(h.state, 0, { revealHands }).opponent.characters.map((c) => c.artCopy);
    expect(field(false)).toEqual([0]);
    expect(field(true)).toEqual([1]);
  });
});
