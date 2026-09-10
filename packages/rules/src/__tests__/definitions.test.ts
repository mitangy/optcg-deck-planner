import { describe, expect, it } from "vitest";
import {
  buildTestDeck,
  getCardDef,
  listCardDefs,
} from "../cards/definitions.js";

describe("Step 3.5 curated defs", () => {
  it("keeps corrected ST01 ids with accurate prints (plus later seed stubs)", () => {
    const ids = listCardDefs().map((d) => d.id);
    for (const id of [
      "ST01-001",
      "ST01-003",
      "ST01-006",
      "ST01-008",
      "ST01-009",
      "ST01-014",
    ]) {
      expect(ids).toContain(id);
    }
    expect(ids).not.toContain("OP01-013");
    expect(ids).not.toContain("ST01-002");
    expect(ids).not.toContain("ST01-017");
  });

  it("matches Bandai print identity for each curated card", () => {
    const luffy = getCardDef("ST01-001");
    expect(luffy.name).toBe("Monkey.D.Luffy");
    expect(luffy.power).toBe(5000);
    expect(luffy.life).toBe(5);
    expect(luffy.leaderActivateGiveRestedDon).toBe(true);

    expect(getCardDef("ST01-003")).toMatchObject({
      name: "Karoo",
      cost: 1,
      power: 3000,
      counter: 1000,
    });
    expect(getCardDef("ST01-006")).toMatchObject({
      name: "TonyTony.Chopper",
      cost: 1,
      power: 1000,
      blocker: true,
    });
    expect(getCardDef("ST01-008")).toMatchObject({
      name: "Nico Robin",
      cost: 3,
      power: 5000,
      counter: 1000,
    });
    expect(getCardDef("ST01-009")).toMatchObject({
      name: "Nefeltari Vivi",
      cost: 2,
      power: 4000,
      counter: 1000,
    });

    const guard = getCardDef("ST01-014");
    expect(guard.name).toBe("Guard Point");
    expect(guard.eventTiming).toBe("counter");
    expect(guard.counterPowerBonus).toBe(3000);
    expect(guard.mainDraw).toBeUndefined();
  });

  it("builds a 20-card deck only from curated characters/events", () => {
    const deck = buildTestDeck(20);
    expect(deck).toHaveLength(20);
    for (const id of deck) {
      expect(listCardDefs().some((d) => d.id === id)).toBe(true);
      expect(getCardDef(id).type).not.toBe("leader");
    }
  });
});
