import { describe, expect, it } from "vitest";
import { buildTestDeck, listCardDefs } from "../cards/definitions.js";
import {
  EFFECT_CATALOG,
  effectsForCard,
  summarizeEffectCoverage,
} from "../cards/effectCatalog.js";
import { LEADER_ABILITY_CATALOG } from "../cards/leaderAbilities.js";
import {
  applyEffectOrder,
  enqueuePendingChoices,
  sortByApnap,
} from "../effectOrder.js";
import { createMatch, skipMulligans } from "../engine.js";
import { createSeededRng } from "../rng.js";
import type { GameEvent, MatchState, PendingChoice } from "../types.js";

function baseState(): MatchState {
  const rng = createSeededRng(1);
  const deck = buildTestDeck(20);
  let state = createMatch({
    seed: 1,
    firstSeat: 0,
    players: [
      { leaderId: "ST01-001", deck: [...deck] },
      { leaderId: "ST01-001", deck: [...deck] },
    ],
  });
  state = skipMulligans(state, rng);
  state.pendingChoices = [];
  return state;
}

function choice(
  partial: Partial<PendingChoice> & Pick<PendingChoice, "id" | "seat" | "cardDefId">,
): PendingChoice {
  return {
    kind: "on_play",
    optional: true,
    prompt: `effect ${partial.id}`,
    ...partial,
  };
}

describe("effect catalog", () => {
  it("covers every curated card definition", () => {
    const ids = new Set(listCardDefs().map((d) => d.id));
    const catalogIds = new Set(EFFECT_CATALOG.map((e) => e.cardId));
    for (const id of ids) {
      expect(catalogIds.has(id), `missing catalog rows for ${id}`).toBe(true);
    }
  });

  it("marks implemented leader abilities as implemented", () => {
    for (const leader of LEADER_ABILITY_CATALOG) {
      if (leader.status !== "implemented") continue;
      const rows = effectsForCard(leader.leaderId);
      expect(rows.length).toBeGreaterThan(0);
      expect(
        rows.some((r) => r.status === "implemented"),
        `${leader.leaderId} should have an implemented effect row`,
      ).toBe(true);
    }
  });

  it("reports coverage totals", () => {
    const cov = summarizeEffectCoverage();
    expect(cov.total).toBe(EFFECT_CATALOG.length);
    expect(cov.implemented + cov.partial + cov.keyword + cov.stub).toBe(cov.total);
    expect(cov.stub).toBeGreaterThan(0);
  });
});

describe("effect order (APNAP + controller choice)", () => {
  it("sorts turn player before opponent", () => {
    const items = [
      { seat: 1 as const, id: "b" },
      { seat: 0 as const, id: "a" },
      { seat: 1 as const, id: "c" },
    ];
    expect(sortByApnap(items, 0).map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(sortByApnap(items, 1).map((x) => x.id)).toEqual(["b", "c", "a"]);
  });

  it("wraps 2+ same-seat effects in an order_effects choice", () => {
    const state = baseState();
    const events: GameEvent[] = [];
    enqueuePendingChoices(
      state,
      [
        choice({ id: "c1", seat: 0, cardDefId: "ST01-003" }),
        choice({ id: "c2", seat: 0, cardDefId: "ST01-004" }),
      ],
      0,
      events,
    );
    expect(state.pendingChoices).toHaveLength(1);
    expect(state.pendingChoices[0]!.kind).toBe("order_effects");
    expect(state.pendingChoices[0]!.unorderedChoices?.map((c) => c.id)).toEqual([
      "c1",
      "c2",
    ]);
  });

  it("lets the controller reorder simultaneous effects", () => {
    const state = baseState();
    const events: GameEvent[] = [];
    enqueuePendingChoices(
      state,
      [
        choice({ id: "c1", seat: 0, cardDefId: "ST01-003" }),
        choice({ id: "c2", seat: 0, cardDefId: "ST01-004" }),
      ],
      0,
      events,
    );
    expect(applyEffectOrder(state, ["c2", "c1"], events)).toBe(true);
    expect(state.pendingChoices.map((c) => c.id)).toEqual(["c2", "c1"]);
  });

  it("queues turn-player effects before opponent when both trigger", () => {
    const state = baseState();
    const events: GameEvent[] = [];
    enqueuePendingChoices(
      state,
      [
        choice({ id: "opp", seat: 1, cardDefId: "OP16-080" }),
        choice({ id: "turn", seat: 0, cardDefId: "ST01-001" }),
      ],
      0,
      events,
    );
    expect(state.pendingChoices.map((c) => c.id)).toEqual(["turn", "opp"]);
  });

  it("rejects illegal order permutations", () => {
    const state = baseState();
    const events: GameEvent[] = [];
    enqueuePendingChoices(
      state,
      [
        choice({ id: "c1", seat: 0, cardDefId: "ST01-003" }),
        choice({ id: "c2", seat: 0, cardDefId: "ST01-004" }),
      ],
      0,
      events,
    );
    expect(applyEffectOrder(state, ["c1", "c1"], events)).toBe(false);
    expect(applyEffectOrder(state, ["c1"], events)).toBe(false);
    expect(applyEffectOrder(state, ["c1", "missing"], events)).toBe(false);
  });
});
