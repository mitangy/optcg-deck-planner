import { describe, expect, it } from "vitest";
import {
  glueSegments,
  groupBattleLogByTurn,
  indexViewInstances,
  narrateEvents,
  rewindBattleLog,
  type BattleLogEntry,
  type InstanceIndex,
} from "./battleLog";

describe("narrateEvents", () => {
  it("keeps the Main phase header and drops the other phase changes (#276)", () => {
    const lines = narrateEvents(
      [
        { type: "phase_changed", phase: "end", activeSeat: 0 },
        { type: "phase_changed", phase: "refresh", activeSeat: 1 },
        { type: "phase_changed", phase: "main", activeSeat: 1 },
      ],
      { youSeat: 0, turnNumber: 2 },
    ).map((e) => e.text);
    expect(lines).toEqual(["—— Main phase · Opponent ——"]);
  });

  it("describes attack, block, counter, and plays from your seat", () => {
    const lines = narrateEvents(
      [
        { type: "card_played", seat: 0, defId: "ST01-003" },
        {
          type: "don_given",
          seat: 0,
          targetDefId: "ST01-001",
          newPower: 7000,
        },
        {
          type: "attack_declared",
          seat: 0,
          target: { kind: "leader" },
          attackerPower: 7000,
          defenderPower: 5000,
        },
        { type: "blocked", seat: 1 },
        { type: "counter_applied", seat: 1, defId: "ST01-014", bonus: 3000 },
        {
          type: "battle_resolved",
          attackerWon: false,
          attackerPower: 7000,
          defenderPower: 8000,
        },
      ],
      { youSeat: 0, turnNumber: 2 },
    ).map((e) => e.text);

    expect(lines.some((t) => t.includes("play"))).toBe(true);
    expect(lines.some((t) => t.includes("attach") && t.includes("7000"))).toBe(
      true,
    );
    expect(lines).toContain("You attack Opponent's Leader (7000 vs 5000)");
    expect(lines).toContain("Opponent blocks");
    expect(lines.some((t) => t.includes("counter"))).toBe(true);
    expect(lines.some((t) => t.includes("Battle fails") && t.includes("7000 vs 8000"))).toBe(
      true,
    );
  });

  it("describes pending-choice ability prompts (on_play / life_trigger chain-ready queue)", () => {
    const lines = narrateEvents(
      [
        {
          type: "pending_choice_added",
          seat: 0,
          kind: "on_play",
          cardDefId: "ST01-005",
          sourceInstanceId: "c1",
          optional: true,
          prompt: "Usopp — On Play: draw 1 card?",
        },
        {
          type: "pending_choice_resolved",
          seat: 0,
          kind: "on_play",
          cardDefId: "ST01-005",
          accepted: true,
        },
        {
          type: "pending_choice_resolved",
          seat: 1,
          kind: "life_trigger",
          cardDefId: "ST01-003",
          accepted: false,
        },
      ],
      { youSeat: 0, turnNumber: 3 },
    ).map((e) => e.text);

    expect(lines[0]).toMatch(/You may resolve Jinbe's on play/i);
    expect(lines[1]).toMatch(/You accept Jinbe's on play/i);
    expect(lines[2]).toMatch(/Opponent declines Karoo's life trigger/i);
  });

  it("groups by turn", () => {
    const entries = [
      ...narrateEvents([{ type: "drew", seat: 0, count: 1 }], {
        youSeat: 0,
        turnNumber: 1,
      }),
      ...narrateEvents([{ type: "don_placed", seat: 0, count: 2 }], {
        youSeat: 0,
        turnNumber: 2,
      }),
    ];
    const groups = groupBattleLogByTurn(entries);
    expect(groups.map((g) => g.turn)).toEqual([1, 2]);
  });
});

describe("narrateEvents emphasis + card segments", () => {
  const narrate = (events: unknown[], youSeat: number | null = 0, instances?: InstanceIndex) =>
    narrateEvents(events, { youSeat, turnNumber: 4, instances });

  it("marks key moments important and routine lines not", () => {
    const [draw, don, counter, ko, life] = narrate([
      { type: "drew", seat: 0, count: 1 },
      { type: "don_placed", seat: 0, count: 2 },
      { type: "counter_applied", seat: 1, defId: "ST01-014", bonus: 2000 },
      { type: "character_ko", seat: 1, defId: "ST01-008" },
      { type: "life_taken", seat: 1, defId: "HIDDEN", toHand: true },
    ]);
    expect([draw!.tone, draw!.important]).toEqual(["routine", false]);
    expect([don!.tone, don!.important]).toEqual(["routine", false]);
    expect([counter!.tone, counter!.important]).toEqual(["counter", true]);
    expect([ko!.tone, ko!.important]).toEqual(["ko", true]);
    expect(ko!.text).toMatch(/^Opponent's .+ is K\.O\.'d$/);
    expect([life!.tone, life!.important]).toEqual(["damage", true]);
    expect(life!.text).toBe("Opponent takes 1 damage (Life → hand)");
  });

  it("emits card segments with defId + owner seat for inspect", () => {
    const [played] = narrate([{ type: "card_played", seat: 1, defId: "ST01-003", costPaid: 2 }]);
    const cardSeg = played!.segments.find((s) => s.kind === "card");
    expect(cardSeg).toMatchObject({ kind: "card", defId: "ST01-003", ownerSeat: 1 });
    expect(played!.text).toContain((cardSeg as { name: string }).name);
  });

  it("names the searched card for its owner and hides it for others", () => {
    const own = narrate([{ type: "card_moved", seat: 0, defId: "ST01-006", from: "deck", to: "hand", hidden: true }], 0);
    expect(own[0]!.tone).toBe("search");
    expect(own[0]!.important).toBe(true);
    expect(own[0]!.segments.some((s) => s.kind === "card" && s.defId === "ST01-006")).toBe(true);
    // Projected for the opponent the server sends "HIDDEN".
    const opp = narrate([{ type: "card_moved", seat: 0, defId: "HIDDEN", from: "deck", to: "hand", hidden: true }], 1);
    expect(opp[0]!.text).toBe("Opponent adds a card from deck to hand");
    expect(opp[0]!.segments.every((s) => s.kind === "text")).toBe(true);
  });

  it("merges a revealed search into one line", () => {
    const lines = narrate(
      [
        { type: "card_revealed", seat: 1, defId: "ST01-006", matchedTrait: true },
        { type: "card_moved", seat: 1, defId: "ST01-006", from: "deck", to: "hand" },
      ],
      0,
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]!.text).toMatch(/^Opponent reveals and adds .+ to hand$/);
  });

  it("describes discards from hand, bounces and hidden Life to hand", () => {
    const [discard, bounce, life] = narrate([
      { type: "card_moved", seat: 0, defId: "ST01-009", from: "hand", to: "trash" },
      { type: "card_moved", seat: 1, defId: "ST01-008", from: "character", to: "hand" },
      { type: "card_moved", seat: 1, defId: "HIDDEN", from: "life", to: "hand", hidden: true },
    ]);
    expect(discard!.text).toMatch(/^You trash .+ from hand$/);
    expect(discard!.tone).toBe("trash");
    expect(bounce!.text).toMatch(/^Opponent's .+ is returned to hand$/);
    expect(life!.text).toBe("Opponent adds a Life card to hand");
  });

  it("flags Leader effect activations as important", () => {
    const [leader, character] = narrate([
      { type: "ability_activated", seat: 0, defId: "ST01-001", abilityId: "a", text: "" },
      { type: "ability_activated", seat: 0, defId: "ST01-003", abilityId: "b", text: "" },
    ]);
    expect(leader!.important).toBe(true);
    expect(leader!.text).toMatch(/^Your Leader .+ activates its effect$/);
    expect(character!.important).toBe(false);
  });

  it("names attacker, target and blocker from the instance index", () => {
    const instances: InstanceIndex = new Map([
      ["a1", { defId: "ST01-008", seat: 0 }],
      ["t1", { defId: "ST01-009", seat: 1 }],
      ["b1", { defId: "ST01-006", seat: 1 }],
    ]);
    const [atk, blk] = narrate(
      [
        { type: "attack_declared", seat: 0, attackerId: "a1", target: { kind: "character", instanceId: "t1" }, attackerPower: 5000, defenderPower: 4000 },
        { type: "blocked", seat: 1, blockerId: "b1" },
      ],
      0,
      instances,
    );
    const cards = atk!.segments.filter((s) => s.kind === "card").map((s) => (s as { defId: string }).defId);
    expect(cards).toEqual(["ST01-008", "ST01-009"]);
    expect(blk!.segments.some((s) => s.kind === "card" && s.defId === "ST01-006")).toBe(true);
  });

  it("indexes both sides of a view with owner seats", () => {
    const idx: InstanceIndex = new Map();
    indexViewInstances(
      {
        seat: 1,
        you: { leader: { id: "L1", defId: "ST01-001" }, characters: [{ id: "c1", defId: "ST01-003" }], stage: null },
        opponent: { leader: { id: "L0", defId: "ST01-001" }, characters: [], stage: { id: "s0", defId: "OP16-021" } },
      },
      idx,
    );
    expect(idx.get("c1")).toEqual({ defId: "ST01-003", seat: 1 });
    expect(idx.get("s0")).toEqual({ defId: "OP16-021", seat: 0 });
  });

  it("uses a readable end reason in game_over", () => {
    const [won] = narrate([{ type: "game_over", winner: 0, reason: "leader_battle_at_zero_life" }]);
    expect(won!.text).toBe("★ You win — Leader took damage with 0 Life");
    expect(won!.tone).toBe("win");
  });

  it("does not leak hidden trigger cards", () => {
    const [avail] = narrate([{ type: "trigger_available", seat: 1, defId: "HIDDEN" }], 0);
    expect(avail!.segments.every((s) => s.kind === "text")).toBe(true);
    expect(avail!.text).not.toContain("HIDDEN");
  });
});

describe("rewindBattleLog", () => {
  const line = (turn: number, text: string): BattleLogEntry => ({
    id: `${turn}-${text}`,
    turn,
    text,
    tone: "routine",
    important: false,
    segments: [{ kind: "text", text }],
  });

  it("drops turns after the target and marks the rewind", () => {
    const out = rewindBattleLog([line(1, "a"), line(2, "b"), line(3, "c")], 2, 1, 0);
    expect(out.map((e) => e.text).slice(0, 2)).toEqual(["a", "b"]);
    expect(out).toHaveLength(3);
    expect(out[2]!.turn).toBe(2);
    expect(out[2]!.text).toContain("Opponent undid the turn");
  });
});

describe("log noise and wrapping", () => {
  it("drops Phase lines and zero-count DON!! events but keeps the Main phase rule and real DON!! (#281)", () => {
    const lines = narrateEvents(
      [
        { type: "phase_changed", phase: "refresh", activeSeat: 0 },
        { type: "phase_changed", phase: "draw", activeSeat: 0 },
        { type: "don_placed", seat: 0, count: 0 },
        { type: "don_placed", seat: 0, count: 2 },
        { type: "phase_changed", phase: "main", activeSeat: 0 },
      ],
      { youSeat: 0, turnNumber: 3 },
    ).map((e) => e.text);
    expect(lines).toEqual(["You place 2 DON!!", "—— Main phase · You ——"]);
  });

  it("keeps the 's after a card name on the name's line, and leaves spaced text free to wrap (#281)", () => {
    const [entry] = narrateEvents(
      [{ type: "pending_choice_resolved", seat: 0, kind: "effect", accepted: false, cardDefId: "ST01-003" }],
      { youSeat: 0, turnNumber: 3 },
    );
    const parts = glueSegments(entry!.segments);
    const cardPart = parts.find((p) => p.seg.kind === "card")!;
    expect(cardPart.glued).toBe("'s");
    expect(parts[parts.length - 1]).toEqual({ seg: { kind: "text", text: " effect" }, glued: "" });
    expect(entry!.text).not.toMatch(/ 's/);
  });

  it("does not glue a card name to text that starts with a space (#281)", () => {
    const parts = glueSegments([
      { kind: "card", defId: "ST01-003", name: "Nami" },
      { kind: "text", text: " to hand" },
    ]);
    expect(parts).toEqual([
      { seg: { kind: "card", defId: "ST01-003", name: "Nami" }, glued: "" },
      { seg: { kind: "text", text: " to hand" }, glued: "" },
    ]);
  });
});
