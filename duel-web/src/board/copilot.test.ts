import { describe, expect, it } from "vitest";
import type { TurnPlan } from "@optcg/analyst-client";
import type { Intent, PendingChoiceView, PlayerView } from "../net/protocol";
import {
  buildSnapshot,
  compactLegal,
  copilotAvailable,
  copilotShown,
  nextIntent,
  planCardMode,
  playBlockReason,
  recentLog,
  replanQuestion,
  skipStep,
  startCursor,
  startRun,
  stepRun,
  stepRunOtherSeat,
  stopRun,
  type PlanCursor,
  type PlanRun,
} from "./copilot";

const card = (id: string, defId = "OP01-001", extra: Record<string, unknown> = {}) => ({ id, defId, ...extra });

function mkView(over: Record<string, unknown> = {}, legalIntents: Intent[] = []): PlayerView {
  return {
    seat: 0,
    activeSeat: 0,
    phase: "main",
    turnNumber: 3,
    battle: null,
    pendingTrigger: null,
    pendingChoices: [],
    winner: null,
    winReason: null,
    you: {
      leader: card("L0", "OP01-001", { power: 5000 }),
      characters: [card("c1", "OP01-025", { power: 5000, attachedDonCount: 1, rested: true, summoningSick: true })],
      stage: null,
      hand: [
        { id: "h1", defId: "OP01-016", playCost: 2 },
        { id: "h2", defId: "OP01-029", playCost: 1, counter: 2000 },
        { id: "h3", defId: "OP01-030" },
      ],
      deckCount: 30,
      trash: ["OP01-016"],
      lifeCount: 5,
      faceUpLife: [{ index: 0, defId: "OP01-030" }],
      donDeckCount: 5,
      costArea: [
        { id: "d1", rested: false },
        { id: "d2", rested: false },
        { id: "d3", rested: true },
      ],
      activeDonCount: 2,
    },
    opponent: {
      leader: card("L1", "OP02-001"),
      characters: [card("o1", "OP02-013", { power: 6000 })],
      stage: null,
      handCount: 5,
      deckCount: 31,
      trash: [],
      lifeCount: 4,
      donDeckCount: 6,
      costAreaCount: 4,
      activeDonCount: 3,
    },
    legalIntents,
    ...over,
  } as unknown as PlayerView;
}

const base = {
  ranked: false,
  role: "player" as const,
  brief: { ticket: "mb1.x" },
  logPoseEnabled: true,
  setting: true,
  viewSeat: 0 as const,
  ticketSeat: 0 as const,
};

describe("when the copilot is offered (#416)", () => {
  it("shows for a player of an unranked game with a ticket, Log Pose on and the setting on (#416)", () => {
    expect(copilotShown(base)).toBe(true);
  });

  it("never shows in ranked games, or when the server didn't say (#416)", () => {
    expect(copilotShown({ ...base, ranked: true })).toBe(false);
    expect(copilotShown({ ...base, ranked: null })).toBe(false);
    expect(copilotShown({ ...base, ranked: undefined })).toBe(false);
  });

  it("never shows to a spectator (#416)", () => {
    expect(copilotShown({ ...base, role: "spectator" })).toBe(false);
  });

  it("needs the setting, Log Pose for the account and a ticket (#416)", () => {
    expect(copilotShown({ ...base, setting: false })).toBe(false);
    expect(copilotShown({ ...base, logPoseEnabled: null })).toBe(false);
    expect(copilotShown({ ...base, logPoseEnabled: false })).toBe(false);
    expect(copilotShown({ ...base, brief: null })).toBe(false);
  });

  it("shows only on the seat the ticket was minted for, so hotseat's seat 1 turns never get it (#416)", () => {
    expect(copilotShown({ ...base, viewSeat: 1, ticketSeat: 0 })).toBe(false);
    expect(copilotShown({ ...base, viewSeat: 1, ticketSeat: 1 })).toBe(true);
    expect(copilotShown({ ...base, viewSeat: undefined })).toBe(false);
    expect(copilotShown({ ...base, ticketSeat: undefined })).toBe(false);
    expect(copilotShown({ ...base, viewSeat: undefined, ticketSeat: undefined })).toBe(false);
    expect(copilotShown({ ...base, viewSeat: null, ticketSeat: null })).toBe(false);
  });
});

describe("the snapshot sent to the analyst (#416)", () => {
  it("never carries the opponent's hand, even from a malformed view, or either seat's revealed hands (#416)", () => {
    const view = mkView({
      revealedHands: [[{ id: "r0", defId: "ST77-777" }], [{ id: "r1", defId: "ST88-888" }]],
    });
    (view.opponent as unknown as Record<string, unknown>).hand = [{ id: "leak1", defId: "ST99-999" }];
    const snap = buildSnapshot(view, null, null);
    const text = JSON.stringify(snap);
    for (const marker of ["ST99-999", "leak1", "ST77-777", "ST88-888", "r0", "r1", "revealedHands"]) expect(text).not.toContain(marker);
    expect(snap.opponent.hand).toBe(5);
  });

  it("copies the board, hand, counts and DON!! as this seat sees them (#416)", () => {
    const snap = buildSnapshot(mkView(), "Battle: x", null);
    expect(snap).toMatchObject({
      seat: 0,
      turn: 3,
      phase: "main",
      yourTurn: true,
      battle: "Battle: x",
      choice: null,
      you: { deck: 30, life: 5, faceUpLife: ["OP01-030"], trash: ["OP01-016"], donActive: 2, donRested: 1, donDeck: 5 },
      opponent: { hand: 5, deck: 31, life: 4, donActive: 3, donTotal: 4, donDeck: 6 },
    });
    expect(snap.you.characters[0]).toEqual({ id: "c1", defId: "OP01-025", rested: true, don: 1, power: 5000, sick: true });
    expect(snap.you.hand).toEqual([
      { id: "h1", defId: "OP01-016", cost: 2 },
      { id: "h2", defId: "OP01-029", cost: 1, counter: 2000 },
      { id: "h3", defId: "OP01-030" },
    ]);
    expect(buildSnapshot(mkView({ activeSeat: 1 }), null, null).yourTurn).toBe(false);
  });

  it("drops cards the analyst would refuse, such as a hidden Life card (#416)", () => {
    const view = mkView();
    view.opponent.faceUpLife = [{ index: 0, defId: "HIDDEN" }, { index: 1, defId: "OP02-005" }];
    expect(buildSnapshot(view, null, null).opponent.faceUpLife).toEqual(["OP02-005"]);
  });

  const choice = (extra: Partial<PendingChoiceView>): PendingChoiceView =>
    ({ id: "ch1", seat: 0, kind: "effect", cardDefId: "OP01-016", optional: false, prompt: "Choose a card", ...extra }) as PendingChoiceView;

  it("includes the front choice only when it is this seat's to answer (#416)", () => {
    expect(buildSnapshot(mkView(), null, choice({})).choice).toEqual({ prompt: "Choose a card", kind: "effect" });
    expect(buildSnapshot(mkView(), null, choice({ seat: 1 })).choice).toBeNull();
    expect(buildSnapshot(mkView(), null, null).choice).toBeNull();
  });

  it("leaves out a choice private to the other seat (#416)", () => {
    expect(buildSnapshot(mkView(), null, choice({ privateToSeat: 1 })).choice).toBeNull();
    expect(buildSnapshot(mkView(), null, choice({ privateToSeat: 0 })).choice).toMatchObject({ kind: "effect" });
  });

  it("cuts lists to the analyst's limits, keeping the newest trash (#416)", () => {
    const view = mkView();
    view.you.characters = Array.from({ length: 14 }, (_, i) => card(`c${i}`, "OP01-025")) as never;
    view.you.hand = Array.from({ length: 25 }, (_, i) => ({ id: `h${i}`, defId: "OP01-016" }));
    view.you.trash = Array.from({ length: 70 }, (_, i) => `OP01-${String(i + 1).padStart(3, "0")}`);
    view.legalIntents = Array.from({ length: 150 }, (_, i) => ({ type: "activate_ability", sourceId: `s${i}`, abilityId: "a" }));
    const snap = buildSnapshot(view, null, null);
    expect(snap.you.characters).toHaveLength(12);
    expect(snap.you.hand).toHaveLength(20);
    expect(snap.you.trash).toHaveLength(60);
    expect(snap.you.trash[59]).toBe("OP01-070");
    expect(snap.legal).toHaveLength(120);
  });

  it("sends the last 40 log lines, each cut to 200 characters (#416)", () => {
    const lines = Array.from({ length: 50 }, (_, i) => ({ text: `line ${i}` }));
    const log = recentLog(lines);
    expect(log).toHaveLength(40);
    expect(log[0]).toBe("line 10");
    expect(recentLog([{ text: "x".repeat(300) }])[0]).toHaveLength(200);
  });
});

describe("legal moves as the analyst reads them (#416)", () => {
  it("gives one give_don per target however many DON!! can go there (#416)", () => {
    const legal = compactLegal(
      mkView({}, [
        { type: "give_don", donId: "d1", targetId: "L0" },
        { type: "give_don", donId: "d2", targetId: "L0" },
        { type: "give_don", donId: "d1", targetId: "c1" },
        { type: "give_don", donId: "d2", targetId: "c1" },
      ]),
    );
    expect(legal).toEqual([
      { type: "give_don", target: "L0" },
      { type: "give_don", target: "c1" },
    ]);
  });

  it("names the card by its instance id instead of its hand index (#416)", () => {
    const legal = compactLegal(
      mkView({}, [
        { type: "play_card", handIndex: 1 },
        { type: "play_card", handIndex: 2, trashCharacterId: "c1" },
        { type: "counter_event", handIndex: 0 },
        { type: "counter_from_hand", handIndex: 2 },
        { type: "play_card", handIndex: 9 },
      ]),
    );
    expect(legal).toEqual([
      { type: "play_card", card: "h2" },
      { type: "play_card", card: "h3", trash: "c1" },
      { type: "counter_event", card: "h1" },
      { type: "counter_from_hand", card: "h3" },
    ]);
  });

  it("maps an attack on the Leader to the opponent Leader's instance id (#416)", () => {
    const legal = compactLegal(
      mkView({}, [
        { type: "declare_attack", attackerId: "L0", target: { kind: "leader" } },
        { type: "declare_attack", attackerId: "c1", target: { kind: "character", instanceId: "o1" } },
      ]),
    );
    expect(legal).toEqual([
      { type: "declare_attack", attacker: "L0", target: "L1" },
      { type: "declare_attack", attacker: "c1", target: "o1" },
    ]);
  });

  it("carries blocks, passes, abilities and end turn, and leaves out choices and mulligans (#416)", () => {
    const legal = compactLegal(
      mkView({}, [
        { type: "declare_block", blockerId: "c1" },
        { type: "pass_block" },
        { type: "pass_counter" },
        { type: "activate_ability", sourceId: "c1", abilityId: "a1", targetId: "o1" },
        { type: "end_turn" },
        { type: "mulligan", doMulligan: true },
        { type: "resolve_pending_choice", accept: true },
      ]),
    );
    expect(legal).toEqual([
      { type: "declare_block", blocker: "c1" },
      { type: "pass_block" },
      { type: "pass_counter" },
      { type: "activate_ability", source: "c1", abilityId: "a1", target: "o1" },
      { type: "end_turn" },
    ]);
  });
});

// ——— The executor ———

const plan = (steps: TurnPlan["steps"], turn = 3): TurnPlan => ({ id: "p1", turn, summary: "Go", steps });
const play = (card: string, trash?: string) => ({ action: "play" as const, card, ...(trash ? { trash } : {}), label: `Play ${card}` });
const give = (target: string, count: number) => ({ action: "give_don" as const, target, count, label: `Give ${count} DON!!` });
const attack = (attacker: string, target: string) => ({ action: "attack" as const, attacker, target, label: "Attack" });
const endTurn = { action: "end_turn" as const, label: "End turn" };

const PLAY_H1: Intent = { type: "play_card", handIndex: 0 };
const END: Intent = { type: "end_turn" };

describe("playing out an approved plan (#416)", () => {
  it("plays a card from the hand by its hand index (#416)", () => {
    const r = nextIntent(plan([play("h2")]), startCursor, mkView({}, [{ type: "play_card", handIndex: 0 }, { type: "play_card", handIndex: 1 }]));
    expect(r).toMatchObject({ kind: "send", intent: { type: "play_card", handIndex: 1 } });
  });

  it("blocks a play whose card has left the hand or can't be played (#416)", () => {
    expect(nextIntent(plan([play("zz")]), startCursor, mkView({}, [PLAY_H1]))).toMatchObject({ kind: "blocked", reason: expect.stringMatching(/no longer in your hand/) });
    expect(nextIntent(plan([play("h2")]), startCursor, mkView({}, [PLAY_H1]))).toMatchObject({ kind: "blocked" });
  });

  it("replaces the Character the plan named when the area is full, and asks you when it named none (#416)", () => {
    const legal: Intent[] = [
      { type: "play_card", handIndex: 0, trashCharacterId: "c1" },
      { type: "play_card", handIndex: 0, trashCharacterId: "c2" },
    ];
    expect(nextIntent(plan([play("h1", "c2")]), startCursor, mkView({}, legal))).toMatchObject({ kind: "send", intent: { trashCharacterId: "c2" } });
    expect(nextIntent(plan([play("h1")]), startCursor, mkView({}, legal))).toMatchObject({ kind: "blocked" });
    expect(nextIntent(plan([play("h1", "c9")]), startCursor, mkView({}, legal))).toMatchObject({ kind: "blocked" });
  });

  it("plays without a replacement when the area has room, even if the plan named one (#416)", () => {
    const r = nextIntent(plan([play("h1", "c1")]), startCursor, mkView({}, [PLAY_H1]));
    expect(r).toMatchObject({ kind: "send", intent: PLAY_H1 });
  });

  it("gives DON!! to the named target one at a time, as many times as the plan says (#416)", () => {
    const p = plan([give("L0", 2), endTurn]);
    const v1 = mkView({}, [{ type: "give_don", donId: "d1", targetId: "c1" }, { type: "give_don", donId: "d1", targetId: "L0" }, { type: "give_don", donId: "d2", targetId: "L0" }, END]);
    const first = nextIntent(p, startCursor, v1);
    expect(first).toMatchObject({ kind: "send", intent: { type: "give_don", donId: "d1", targetId: "L0" } });
    const v2 = mkView({}, [{ type: "give_don", donId: "d2", targetId: "L0" }, END]);
    const second = nextIntent(p, (first as { cursor: PlanCursor }).cursor, v2);
    expect(second).toMatchObject({ kind: "send", intent: { type: "give_don", donId: "d2", targetId: "L0" } });
    const v3 = mkView({}, [END]);
    const third = nextIntent(p, (second as { cursor: PlanCursor }).cursor, v3);
    expect(third).toMatchObject({ kind: "send", intent: END });
  });

  it("blocks a give_don when there isn't enough DON!! for the count (#416)", () => {
    const p = plan([give("L0", 2)]);
    const first = nextIntent(p, startCursor, mkView({}, [{ type: "give_don", donId: "d1", targetId: "L0" }])) as { cursor: PlanCursor };
    expect(nextIntent(p, first.cursor, mkView({}, []))).toMatchObject({ kind: "blocked", cursor: { step: 0, done: 1 } });
  });

  it("uses the named ability and target, and attacks the named Leader or Character (#416)", () => {
    const legal: Intent[] = [
      { type: "activate_ability", sourceId: "c1", abilityId: "a1" },
      { type: "activate_ability", sourceId: "c1", abilityId: "a2", targetId: "o1" },
      { type: "declare_attack", attackerId: "L0", target: { kind: "leader" } },
      { type: "declare_attack", attackerId: "L0", target: { kind: "character", instanceId: "o1" } },
    ];
    const view = mkView({}, legal);
    const act = (s: TurnPlan["steps"][number]) => nextIntent(plan([s]), startCursor, view);
    expect(act({ action: "activate", source: "c1", abilityId: "a2", label: "x" })).toMatchObject({ kind: "send", intent: legal[1] });
    expect(act({ action: "activate", source: "c1", target: "o1", label: "x" })).toMatchObject({ kind: "send", intent: legal[1] });
    expect(act({ action: "activate", source: "c1", abilityId: "a9", label: "x" })).toMatchObject({ kind: "blocked" });
    expect(act(attack("L0", "L1"))).toMatchObject({ kind: "send", intent: legal[2] });
    expect(act(attack("L0", "o1"))).toMatchObject({ kind: "send", intent: legal[3] });
    expect(act(attack("L0", "o9"))).toMatchObject({ kind: "blocked" });
    expect(act(attack("c1", "L1"))).toMatchObject({ kind: "blocked" });
  });

  it("ends the turn only through the legal end_turn (#416)", () => {
    expect(nextIntent(plan([endTurn]), startCursor, mkView({}, [END]))).toMatchObject({ kind: "send", intent: END });
    expect(nextIntent(plan([endTurn]), startCursor, mkView({}, []))).toMatchObject({ kind: "blocked" });
  });

  it("waits through the opponent's turn, a battle and the block and counter steps, whatever the legal list says (#416)", () => {
    const p = plan([endTurn]);
    expect(nextIntent(p, startCursor, mkView({ activeSeat: 1 }, [END]))).toMatchObject({ kind: "waiting" });
    expect(nextIntent(p, startCursor, mkView({ phase: "counter" }, [END]))).toMatchObject({ kind: "waiting" });
    expect(nextIntent(p, startCursor, mkView({ battle: { attackerId: "L0" } }, [END]))).toMatchObject({ kind: "waiting" });
  });

  it("hands a pending choice of yours to you, and waits while the opponent has one (#416)", () => {
    const p = plan([endTurn]);
    const mine = [{ id: "ch", seat: 0, kind: "effect", prompt: "Pick" }];
    const theirs = [{ id: "ch", seat: 1, kind: "effect", prompt: "Pick" }];
    expect(nextIntent(p, startCursor, mkView({ pendingChoices: mine }, [END]))).toMatchObject({ kind: "choice" });
    expect(nextIntent(p, startCursor, mkView({ pendingChoices: theirs }, [END]))).toMatchObject({ kind: "waiting" });
  });

  it("stops when the turn has moved on or the game is over, instead of playing an old plan (#416)", () => {
    const p = plan([endTurn]);
    expect(nextIntent(p, startCursor, mkView({ turnNumber: 5 }, [END]))).toMatchObject({ kind: "stale" });
    expect(nextIntent(p, startCursor, mkView({ winner: 1 }, [END]))).toMatchObject({ kind: "stale" });
  });

  it("sends at most one intent per view and moves on only after the view shows it taken (#416)", () => {
    const p = plan([play("h1"), endTurn]);
    const v1 = mkView({}, [PLAY_H1, END]);
    const sent = nextIntent(p, startCursor, v1);
    expect(sent).toMatchObject({ kind: "send", intent: PLAY_H1 });
    const cursor = (sent as { cursor: PlanCursor }).cursor;
    // The same view again (or any view that still has the card in hand) sends nothing.
    expect(nextIntent(p, cursor, v1)).toMatchObject({ kind: "waiting", cursor: { step: 0 } });
    const unchanged = mkView({}, [PLAY_H1, END]);
    expect(nextIntent(p, cursor, unchanged)).toMatchObject({ kind: "waiting", cursor: { step: 0 } });
    // An attack is taken only when it is no longer legal; a view that still offers it sends nothing.
    const atk = plan([attack("L0", "L1"), endTurn]);
    const atkLegal: Intent[] = [{ type: "declare_attack", attackerId: "L0", target: { kind: "leader" } }, END];
    const atkSent = nextIntent(atk, startCursor, mkView({}, atkLegal)) as { cursor: PlanCursor };
    expect(nextIntent(atk, atkSent.cursor, mkView({}, atkLegal))).toMatchObject({ kind: "waiting", cursor: { step: 0 } });
    expect(nextIntent(atk, atkSent.cursor, mkView({}, [END]))).toMatchObject({ kind: "send", intent: END, cursor: { step: 1 } });
    // The card left the hand: now the next step goes.
    const v2 = mkView({}, [END]);
    v2.you.hand = v2.you.hand.filter((c) => c.id !== "h1");
    expect(nextIntent(p, cursor, v2)).toMatchObject({ kind: "send", intent: END, cursor: { step: 1 } });
  });

  it("is done once the last step has taken effect, even though the turn has changed (#416)", () => {
    const p = plan([endTurn]);
    const sent = nextIntent(p, startCursor, mkView({}, [END])) as { cursor: PlanCursor };
    const after = mkView({ activeSeat: 1, turnNumber: 4 }, []);
    expect(nextIntent(p, sent.cursor, after)).toEqual({ kind: "done" });
  });
});

describe("a plan run: approve, step, skip, stop (#416)", () => {
  const p = plan([play("h1"), attack("L0", "L1"), endTurn]);

  it("starts running, sends the first step and then nothing more on the same view (#416)", () => {
    const view = mkView({}, [PLAY_H1, END]);
    const first = stepRun(startRun(p), view);
    expect(first.send).toEqual(PLAY_H1);
    expect(first.run.state).toBe("running");
    expect(stepRun(first.run, view).send).toBeNull();
  });

  it("stops for good: a stopped run never sends again (#416)", () => {
    const view = mkView({}, [PLAY_H1]);
    const stopped = stopRun(startRun(p), "You stopped it.");
    expect(stopped).toMatchObject({ state: "stopped", reason: "You stopped it." });
    expect(stepRun(stopped, view)).toEqual({ run: stopped, send: null });
  });

  it("goes to choice while you answer a prompt and carries on after (#416)", () => {
    const run = startRun(p);
    const asking = stepRun(run, mkView({ pendingChoices: [{ id: "c", seat: 0, kind: "effect", prompt: "p" }] }, [])).run;
    expect(asking.state).toBe("choice");
    const resumed = stepRun(asking, mkView({}, [PLAY_H1]));
    expect(resumed.run.state).toBe("running");
    expect(resumed.send).toEqual(PLAY_H1);
  });

  it("blocks on a step that isn't legal and can skip it to the next (#416)", () => {
    const view = mkView({}, [END]);
    view.you.hand = [];
    const blocked = stepRun(startRun(p), view).run;
    expect(blocked).toMatchObject({ state: "blocked", cursor: { step: 0 } });
    expect(blocked.reason).toBeTruthy();
    const skipped = skipStep(blocked);
    expect(skipped).toMatchObject({ state: "running", cursor: { step: 1, done: 0, inFlight: null } });
    expect(skipStep(startRun(p)).cursor.step).toBe(0);
  });

  it("ends as done after the last step, and stopped when the turn changes (#416)", () => {
    const last: PlanRun = { ...startRun(p), cursor: { step: 2, done: 0, inFlight: END } };
    expect(stepRun(last, mkView({ activeSeat: 1, turnNumber: 4 }, [])).run.state).toBe("done");
    expect(stepRun(startRun(p), mkView({ turnNumber: 4 }, [PLAY_H1])).run).toMatchObject({ state: "stopped", reason: "The turn changed." });
  });

  it("asks the player's question to re-plan from the step that stopped (#416)", () => {
    expect(replanQuestion(p, 1, "That attack isn't possible any more.")).toBe(
      "The plan stopped at step 2 (Attack): That attack isn't possible any more. Plan the rest of my turn from here.",
    );
  });
});

describe("the Play this turn button (#416)", () => {
  const p = plan([endTurn]);
  const stepsRunning: PlanRun = { ...startRun(plan([endTurn], 3)), plan: { ...p, id: "other" } };

  it("is available on your own turn for this turn's plan (#416)", () => {
    expect(playBlockReason(p, mkView(), null)).toBeNull();
    expect(planCardMode(p, null, null, mkView())).toEqual({ kind: "idle", disabledReason: null });
  });

  it("says why it can't start: not your turn, an earlier turn's plan, another plan running (#416)", () => {
    expect(playBlockReason(p, mkView({ activeSeat: 1 }), null)).toBe("It isn't your turn.");
    expect(playBlockReason(p, mkView({ turnNumber: 5 }), null)).toBe("This plan was for an earlier turn.");
    expect(playBlockReason(p, mkView(), stepsRunning)).toMatch(/another plan is running/i);
    expect(playBlockReason(p, mkView({ winner: 0 }), null)).toBeTruthy();
    expect(playBlockReason(p, null, null)).toBeTruthy();
  });

  it("lets a finished run stop blocking the next plan (#416)", () => {
    expect(playBlockReason(p, mkView(), stopRun(stepsRunning))).toBeNull();
  });

  it("shows a run's own state on its card (#416)", () => {
    const run = startRun(p);
    expect(planCardMode(p, run, run, mkView())).toEqual({ kind: "running", step: 0 });
    expect(planCardMode(p, stopRun(run, "r"), null, mkView())).toEqual({ kind: "stopped", step: 0, reason: "r" });
    expect(planCardMode(p, { ...run, state: "done" }, null, mkView())).toEqual({ kind: "done" });
    expect(planCardMode(p, { ...run, state: "blocked", reason: "no" }, run, mkView())).toEqual({ kind: "blocked", step: 0, reason: "no" });
  });
});

describe("a plan outlives the device showing the other seat (#416)", () => {
  it("the game still offers the copilot while the view is the other seat's; only the button needs the ticket's seat (#416)", () => {
    expect(copilotAvailable({ ...base, viewSeat: 1, ticketSeat: 0 } as typeof base)).toBe(true);
    expect(copilotShown({ ...base, viewSeat: 1, ticketSeat: 0 })).toBe(false);
    expect(copilotAvailable({ ...base, ticketSeat: undefined })).toBe(false);
  });

  const p = plan([give("L0", 1), attack("L0", "L1"), endTurn]);
  const sentEnd: PlanRun = { ...startRun(p), cursor: { step: 2, done: 0, inFlight: END } };

  it("waits on the same turn while the defender answers (#416)", () => {
    const run = { ...startRun(p), cursor: { step: 1, done: 0, inFlight: null } };
    expect(stepRunOtherSeat(run, mkView({ seat: 1, activeSeat: 0, turnNumber: 3 }, []))).toBe(run);
  });

  it("is done when the turn has passed to the other seat after End turn was sent (#416)", () => {
    expect(stepRunOtherSeat(sentEnd, mkView({ seat: 1, activeSeat: 1, turnNumber: 4 }, []))).toMatchObject({ state: "done" });
  });

  it("stops, turn changed, when the turn has moved on before the plan finished (#416)", () => {
    const mid = { ...startRun(p), cursor: { step: 1, done: 0, inFlight: null } };
    expect(stepRunOtherSeat(mid, mkView({ seat: 1, activeSeat: 1, turnNumber: 4 }, []))).toMatchObject({ state: "stopped", reason: "The turn changed." });
  });

  it("leaves a run that already ended alone (#416)", () => {
    const stopped = stopRun(startRun(p), "You stopped it.");
    expect(stepRunOtherSeat(stopped, mkView({ seat: 1, turnNumber: 4 }, []))).toBe(stopped);
  });
});
