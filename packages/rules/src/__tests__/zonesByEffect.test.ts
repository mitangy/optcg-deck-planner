import { describe, expect, it } from "vitest";
import { Harness } from "../testing/harness.js";
import type { GameEvent, Seat } from "../types.js";

// Moving cards between zones by effects: Stage replacement and putting Characters or cards into Life.

const KAROO = "ST01-003"; // vanilla 1-cost {Animal}/{Alabasta}
const ALVIDA = "OP03-023"; // vanilla 1-cost {East Blue}

function ids(h: Harness, seat: Seat): string[] {
  return h.state.players[seat].characters.map((c) => c.defId);
}

/** Answer the front prompt like `Harness.pick`, but keep the events the answer produced. */
function resolveWithEvents(h: Harness, ...keys: string[]): GameEvent[] {
  const choice = h.choice!;
  const r = choice.request as { options: { id: string; defId?: string; label?: string }[] };
  const used = new Set<string>();
  const selectedOptionIds = keys.map((k) => {
    const o = r.options.find((x) => !used.has(x.id) && (x.defId === k || x.label === k));
    if (!o) throw new Error(`No option ${k}`);
    used.add(o.id);
    return o.id;
  });
  const res = h.try(choice.seat, { type: "resolve_pending_choice", accept: true, selectedOptionIds });
  if (!res.ok) throw new Error(res.error?.message);
  h.state = res.state;
  return res.events;
}

describe("a Stage played over another Stage", () => {
  const MINI_MERRY = "EB01-011"; // Stage, 1 cost
  const LAND_OF_WANO = "OP02-048"; // Stage, 1 cost

  it("trashes the Stage already on the field (#753)", () => {
    const h = new Harness();
    h.stage(0, LAND_OF_WANO);
    h.hand(0, MINI_MERRY);
    h.don(0, 2);
    h.play(0, MINI_MERRY);
    expect(h.state.players[0].stage?.defId).toBe(MINI_MERRY);
    expect(h.state.players[0].trash).toEqual([LAND_OF_WANO]);
  });
});

describe("putting a Character into Life by an effect", () => {
  const GASTINO = "EB01-053"; // [On Play] Place up to 1 of your opponent's Characters with a cost of 3 or less at the top or bottom of your opponent's Life cards face-up.
  const SHIRYU = "OP16-108"; // [On Play] You may trash 1 card from your hand: Add up to 1 {Blackbeard Pirates} type card with a cost of 6 or less from your trash to the top of your Life cards face-up.
  const PIZARRO = "OP09-082"; // vanilla 4-cost {Blackbeard Pirates}
  const LUFFY_LEADER = "ST13-003"; // [DON!! x2] [Activate: Main] [Once Per Turn] You may trash 1 card from your hand: If you have 0 Life cards, add up to 2 Character cards with a cost of 5 from your hand or trash to the top of your Life cards face-up.
  const MOUNTAIN_GOD = "EB01-018"; // vanilla 5-cost
  const BUGGY = "OP16-041"; // Leader. [DON!! x1] [Once Per Turn] This effect can be activated when your {Impel Down} type Character card is removed from the field. Play up to 1 [Prisoner of Impel Down] card from your hand.
  const PRISONER = "OP16-042"; // 6-cost
  const BLUGORI = "OP02-084"; // vanilla 1-cost {Impel Down}

  function gastinoOn(target: string, end: "Top" | "Bottom") {
    const h = new Harness();
    h.field(1, target);
    h.life(1, KAROO, KAROO, KAROO);
    h.hand(0, GASTINO);
    h.don(0, 3);
    h.play(0, GASTINO).pick(target);
    return { h, events: resolveWithEvents(h, end) };
  }

  it("Top puts the Character on top of the owner's Life, face-up, and says it came from the field (#753)", () => {
    const { h, events } = gastinoOn(ALVIDA, "Top");
    expect(ids(h, 1)).toEqual([]);
    expect(h.state.players[1].life).toEqual([ALVIDA, KAROO, KAROO, KAROO]);
    expect(h.state.players[1].faceUpLife).toEqual([true, false, false, false]);
    expect(events).toContainEqual({ type: "life_added", seat: 1, defId: ALVIDA, source: "field", faceUp: true });
  });

  it("Bottom puts the Character under the owner's Life (#753)", () => {
    const { h } = gastinoOn(ALVIDA, "Bottom");
    expect(h.state.players[1].life).toEqual([KAROO, KAROO, KAROO, ALVIDA]);
    expect(h.state.players[1].faceUpLife).toEqual([false, false, false, true]);
  });

  it("a Character leaving the field this way triggers the owner's \"removed from the field\" ability (#753)", () => {
    const h = new Harness({ leaders: ["ST01-001", BUGGY] });
    h.field(1, BLUGORI);
    h.hand(1, PRISONER);
    h.attach(1, h.state.players[1].leader, 1);
    h.hand(0, GASTINO);
    h.don(0, 3);
    h.play(0, GASTINO).pick(BLUGORI);
    h.pick("Top");
    expect(h.choice?.seat).toBe(1);
    h.accept().pick(PRISONER);
    expect(h.state.players[1].life[0]).toBe(BLUGORI);
    expect(ids(h, 1)).toEqual([PRISONER]);
  });

  it("a card added from the trash says it came from the trash (#753)", () => {
    const h = new Harness();
    h.hand(0, SHIRYU, KAROO);
    h.trash(0, PIZARRO);
    h.don(0, 6);
    h.play(0, SHIRYU).accept().pick(KAROO);
    const events = resolveWithEvents(h, PIZARRO);
    expect(h.state.players[0].life[0]).toBe(PIZARRO);
    expect(h.state.players[0].trash).toEqual([KAROO]);
    expect(events).toContainEqual({ type: "life_added", seat: 0, defId: PIZARRO, source: "trash", faceUp: true });
  });

  it("a card added from the hand says it came from the hand (#753)", () => {
    const h = new Harness({ leaders: [LUFFY_LEADER, "ST01-001"] });
    h.life(0);
    h.attach(0, h.state.players[0].leader, 2);
    h.hand(0, KAROO, MOUNTAIN_GOD);
    h.act(0, { type: "activate_ability", sourceId: h.state.players[0].leader.id, abilityId: "st13-003#0" });
    h.pick(KAROO);
    const events = resolveWithEvents(h, MOUNTAIN_GOD);
    expect(h.state.players[0].life).toEqual([MOUNTAIN_GOD]);
    expect(h.state.players[0].hand).toEqual([]);
    expect(events).toContainEqual({ type: "life_added", seat: 0, defId: MOUNTAIN_GOD, source: "hand", faceUp: true });
  });
});
