import { describe, expect, it } from "vitest";
import type { ChoiceAnswer, TurnPlan } from "@optcg/analyst-client";
import type { Intent, PendingChoiceView, PlayerView } from "../net/protocol";
import {
  autoAsk,
  autoAskAllowed,
  buildSnapshot,
  choiceAnswerIntent,
  compactLegal,
  copilotAvailable,
  copilotShown,
  gameAttached,
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

describe("when the live game is attached to Log Pose (#620)", () => {
  const attached = { ...base, setting: false, briefSetting: true };

  it("attaches with the matchup brief on and the copilot off, so the brief's panel can see the hand (#620)", () => {
    expect(gameAttached(attached)).toBe(true);
    expect(copilotAvailable({ ...attached })).toBe(false);
  });

  it("attaches with the copilot on and the brief off (#620)", () => {
    expect(gameAttached({ ...base, setting: true, briefSetting: false })).toBe(true);
  });

  it("attaches to nothing when both settings are off (#620)", () => {
    expect(gameAttached({ ...attached, briefSetting: false })).toBe(false);
  });

  it("stays out of ranked games, spectators, and rooms without a ticket, Log Pose or a ticket seat (#620)", () => {
    expect(gameAttached({ ...attached, ranked: true })).toBe(false);
    expect(gameAttached({ ...attached, ranked: null })).toBe(false);
    expect(gameAttached({ ...attached, role: "spectator" })).toBe(false);
    expect(gameAttached({ ...attached, brief: null })).toBe(false);
    expect(gameAttached({ ...attached, logPoseEnabled: false })).toBe(false);
    expect(gameAttached({ ...attached, ticketSeat: undefined })).toBe(false);
  });
});

describe("the snapshot sent to the analyst (#416)", () => {
  it("says who goes first, and during the mulligan whether you chose (#620)", () => {
    const you = mkView().you;
    const mull = (over: Record<string, unknown>, mulliganDone?: boolean) => buildSnapshot(mkView({ phase: "mulligan", ...over, you: { ...you, mulliganDone } }), null, null);
    expect(mull({ firstSeat: 0 }, false)).toMatchObject({ first: true, mulliganDone: false });
    expect(mull({ firstSeat: 1 }, true)).toMatchObject({ first: false, mulliganDone: true });
    const old = mull({}, false);
    expect(old).not.toHaveProperty("first");
    // Past the mulligan the flag is noise.
    expect(buildSnapshot(mkView({ firstSeat: 0, you: { ...you, mulliganDone: true } }), null, null)).not.toHaveProperty("mulliganDone");
  });


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
    expect(buildSnapshot(mkView(), null, choice({})).choice).toMatchObject({ id: "ch1", prompt: "Choose a card", kind: "effect" });
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

  it("runs a planned activate with a target even though engine legal activations never carry one (#419)", () => {
    const legal: Intent[] = [{ type: "activate_ability", sourceId: "c1", abilityId: "a1" }];
    const view = mkView({}, legal);
    const act = (s: TurnPlan["steps"][number]) => nextIntent(plan([s]), startCursor, view);
    expect(act({ action: "activate", source: "c1", abilityId: "a1", target: "o1", label: "x" })).toMatchObject({ kind: "send", intent: legal[0] });
    // Ignoring the target must not loosen the source or ability match.
    expect(act({ action: "activate", source: "c2", abilityId: "a1", target: "o1", label: "x" })).toMatchObject({ kind: "blocked" });
    expect(act({ action: "activate", source: "c1", abilityId: "a9", target: "o1", label: "x" })).toMatchObject({ kind: "blocked" });
  });

  it("uses the named ability, and attacks the named Leader or Character (#416)", () => {
    const legal: Intent[] = [
      { type: "activate_ability", sourceId: "c1", abilityId: "a1" },
      { type: "activate_ability", sourceId: "c1", abilityId: "a2", targetId: "o1" },
      { type: "declare_attack", attackerId: "L0", target: { kind: "leader" } },
      { type: "declare_attack", attackerId: "L0", target: { kind: "character", instanceId: "o1" } },
    ];
    const view = mkView({}, legal);
    const act = (s: TurnPlan["steps"][number]) => nextIntent(plan([s]), startCursor, view);
    expect(act({ action: "activate", source: "c1", abilityId: "a2", label: "x" })).toMatchObject({ kind: "send", intent: legal[1] });
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

  it("refuses a plan made in an earlier game: instance ids are re-permuted per game (#419)", () => {
    const gameA = plan([{ action: "play", card: "card_17", label: "Play card_17" }]);
    const stamped: TurnPlan = { ...gameA, gameKey: "mb1.gameA" };
    // Game B has a different card under the same id and a legal play for it on the same turn.
    const viewB = mkView({ you: { ...mkView().you, hand: [{ id: "card_17", defId: "OP01-120", playCost: 5 }] } }, [{ type: "play_card", handIndex: 0 }]);
    expect(playBlockReason(stamped, viewB, null, "mb1.gameB")).toBe("This plan was for an earlier game.");
    expect(planCardMode(stamped, null, null, viewB, "mb1.gameB")).toEqual({ kind: "idle", disabledReason: "This plan was for an earlier game." });
    // A plan with no stamp can't be tied to this game either.
    expect(playBlockReason(gameA, viewB, null, "mb1.gameB")).toBe("This plan was for an earlier game.");
    // The same game's own plan still plays.
    expect(playBlockReason(stamped, viewB, null, "mb1.gameA")).toBeNull();
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

// ——— Log Pose plays the turn (#725) ———

describe("the choice in the snapshot (#725)", () => {
  const ch = (extra: Partial<PendingChoiceView>): PendingChoiceView =>
    ({ id: "ch1", seat: 0, kind: "effect", cardDefId: "OP01-016", optional: false, prompt: "Choose", ...extra }) as PendingChoiceView;
  const opts = (n: number, eligible = true) => Array.from({ length: n }, (_, i) => ({ id: `o${i}`, defId: "OP01-016", eligible }));

  it("carries the id and every option of a select with its limits, and marks what can be declined (#725)", () => {
    const c = buildSnapshot(mkView(), null, ch({ optional: true, request: { type: "select", min: 1, max: 2, options: [{ id: "o1", defId: "OP01-016", eligible: true, ownerSeat: 1, zone: "character", instanceId: "i9" }, { id: "o2", defId: "HIDDEN", eligible: false }] } })).choice!;
    expect(c).toMatchObject({ id: "ch1", optional: true, request: { type: "select", min: 1, max: 2 } });
    expect(c.request!.options).toEqual([
      { id: "o1", defId: "OP01-016", inst: "i9", zone: "character", owner: "opponent", eligible: true },
      // A hidden card never goes out as a card number.
      { id: "o2", eligible: false },
    ]);
  });

  it("marks a Life card without [Trigger] and a cost that can't be paid as decline-only (#725)", () => {
    expect(buildSnapshot(mkView(), null, ch({ kind: "life_trigger", noTrigger: true })).choice).toMatchObject({ declineOnly: true, optional: true });
    expect(buildSnapshot(mkView(), null, ch({ unpayable: true })).choice).toMatchObject({ declineOnly: true, optional: true });
    expect(buildSnapshot(mkView(), null, ch({ kind: "life_trigger" })).choice).not.toHaveProperty("declineOnly");
  });

  it("sends the abilities of an order_effects prompt as an order, and look and order requests with their limits (#725)", () => {
    const order = buildSnapshot(mkView(), null, ch({ kind: "order_effects", unorderedChoices: [ch({ id: "u1", prompt: "Draw 1" }), ch({ id: "u2", prompt: "K.O. one" })] })).choice!;
    expect(order.request).toMatchObject({ type: "order", options: [{ id: "u1", label: "Draw 1" }, { id: "u2", label: "K.O. one" }] });
    const look = buildSnapshot(mkView(), null, ch({ request: { type: "look", options: opts(3), minSelect: 0, maxSelect: 1, groups: [], rest: "top_or_bottom", restLabel: "" } })).choice!;
    expect(look.request).toMatchObject({ type: "look", min: 0, max: 1, rest: "top_or_bottom" });
  });

  it("marks a request with more than 40 options truncated, eligible ones first, so Log Pose won't guess at it (#725)", () => {
    const many = [...opts(30, false), ...opts(20).map((o, i) => ({ ...o, id: `e${i}` }))];
    const r = buildSnapshot(mkView(), null, ch({ request: { type: "select", min: 1, max: 1, options: many } })).choice!.request!;
    expect(r.options).toHaveLength(40);
    expect(r.truncated).toBe(true);
    expect(r.options![0]!.eligible).toBe(true);
    expect(buildSnapshot(mkView(), null, ch({ request: { type: "select", min: 1, max: 1, options: opts(40) } })).choice!.request).not.toHaveProperty("truncated");
  });
});

describe("how many times Log Pose may ask on its own in a turn (#725)", () => {
  it("allows exactly six automatic requests and refuses the seventh (#725)", () => {
    expect(autoAskAllowed(0)).toBe(true);
    expect(autoAskAllowed(5)).toBe(true);
    expect(autoAskAllowed(6)).toBe(false);
    expect(autoAskAllowed(7)).toBe(false);
  });
});

describe("what Log Pose is asked next while it plays the turn (#725)", () => {
  const p = plan([give("L0", 1), endTurn]);
  const auto = (over: Partial<PlanRun> = {}): PlanRun => ({ ...startRun(p, true), ...over });
  const none = new Set<string>();
  const front = (extra: Record<string, unknown> = {}) => [{ id: "ch7", seat: 0, kind: "effect", prompt: "Choose a card to trash", ...extra }];

  it("asks about the front choice of its own seat, once per choice id (#725)", () => {
    const run = auto({ state: "choice" });
    const a = autoAsk(run, mkView({ pendingChoices: front() }), none)!;
    expect(a).toMatchObject({ kind: "choice", key: "choice:ch7" });
    expect(a.text).toContain("Choose a card to trash");
    expect(autoAsk(run, mkView({ pendingChoices: front() }), new Set([a.key]))).toBeNull();
    expect(autoAsk(run, mkView({ pendingChoices: front({ id: "ch8" }) }), new Set([a.key]))).toMatchObject({ key: "choice:ch8" });
  });

  it("never asks about the opponent's choice (#725)", () => {
    expect(autoAsk(auto({ state: "running" }), mkView({ pendingChoices: front({ seat: 1 }) }), none)).toBeNull();
  });

  it("asks nothing for a run the player started themselves, or on another turn, or after the game (#725)", () => {
    const manual = { ...auto(), auto: undefined } as PlanRun;
    expect(autoAsk(manual, mkView({ pendingChoices: front() }), none)).toBeNull();
    expect(autoAsk(auto({ state: "choice" }), mkView({ turnNumber: 4, pendingChoices: front() }), none)).toBeNull();
    expect(autoAsk(auto({ state: "choice" }), mkView({ winner: 0, pendingChoices: front() }), none)).toBeNull();
    expect(autoAsk(null, mkView(), none)).toBeNull();
  });

  it("asks for a new plan when a step is blocked, with the step and why (#725)", () => {
    const a = autoAsk(auto({ state: "blocked", reason: "That card can't be played.", cursor: { step: 0, done: 0, inFlight: null } }), mkView(), none)!;
    expect(a).toMatchObject({ kind: "replan", key: `replan:${p.id}:0` });
    expect(a.text).toBe(replanQuestion(p, 0, "That card can't be played."));
  });

  it("asks to play the rest when the run finished without ending the turn, and only once nothing is going on (#725)", () => {
    const done = auto({ state: "done", cursor: { step: 2, done: 0, inFlight: null } });
    expect(autoAsk(done, mkView(), none)).toMatchObject({ kind: "continue", key: `continue:${p.id}` });
    expect(autoAsk(done, mkView({ battle: { attackerId: "L0" } }), none)).toBeNull();
    expect(autoAsk(done, mkView({ phase: "counter" }), none)).toBeNull();
    expect(autoAsk(done, mkView({ activeSeat: 1 }), none)).toBeNull();
    expect(autoAsk(done, mkView(), new Set([`continue:${p.id}`]))).toBeNull();
  });

  it("answers a choice first when the run finished with a prompt still open (#725)", () => {
    const done = auto({ state: "done", cursor: { step: 2, done: 0, inFlight: null } });
    expect(autoAsk(done, mkView({ pendingChoices: front() }), none)).toMatchObject({ kind: "choice" });
  });

  it("asks nothing while the run is just playing (#725)", () => {
    expect(autoAsk(auto({ state: "running" }), mkView(), none)).toBeNull();
  });
});

describe("carrying out Log Pose's answer to a choice (#725)", () => {
  const ch = (extra: Partial<PendingChoiceView>): PendingChoiceView =>
    ({ id: "ch1", seat: 0, kind: "effect", cardDefId: "OP01-016", optional: false, prompt: "Choose", ...extra }) as PendingChoiceView;
  const ans = (extra: Partial<ChoiceAnswer> = {}): ChoiceAnswer => ({ id: "tu1", choiceId: "ch1", accept: true, summary: "x", ...extra });
  const o = (id: string, extra: Record<string, unknown> = {}) => ({ id, defId: "OP01-016", eligible: true, ...extra });
  const select = (extra: Record<string, unknown> = {}) => ch({ request: { type: "select", min: 1, max: 2, options: [o("a"), o("b"), o("c", { eligible: false }), o("d")], ...extra } as never });
  const names: Record<string, string> = { "OP01-016": "Nami", "OP01-029": "Sanji" };
  const nameOf = (id: string) => names[id] ?? id;
  const intent = (c: PendingChoiceView, a: ChoiceAnswer, nameFor?: (defId: string) => string) => choiceAnswerIntent(c, a, 0, nameFor);

  it("answers only the choice it names, never the next prompt (#725)", () => {
    expect(choiceAnswerIntent(select(), ans({ choiceId: "ch0", selectedOptionIds: ["a"] }), 0)).toBeNull();
    expect(choiceAnswerIntent(select(), ans({ selectedOptionIds: ["a"] }), 0)).toEqual({ type: "resolve_pending_choice", accept: true, selectedOptionIds: ["a"] });
  });

  it("answers only a choice that is this seat's own (#725)", () => {
    expect(choiceAnswerIntent(select({}), ans({ selectedOptionIds: ["a"] }), 1)).toBeNull();
    expect(choiceAnswerIntent(ch({ seat: 1 }), ans({}), 0)).toBeNull();
  });

  it("builds a select from eligible, unique picks within min..max (#725)", () => {
    for (const bad of [[], ["a", "a"], ["c"], ["zzz"], ["a", "b", "d"]]) expect(intent(select(), ans({ selectedOptionIds: bad }))).toBeNull();
    expect(intent(select(), ans({}))).toBeNull();
    expect(intent(select(), ans({ selectedOptionIds: ["a", "b"] }))).toMatchObject({ selectedOptionIds: ["a", "b"] });
    expect(intent(select({ min: 0 }), ans({ selectedOptionIds: [] }))).toMatchObject({ accept: true, selectedOptionIds: [] });
  });

  it("refuses two picks with the same card name when the prompt wants different ones (#725)", () => {
    const same = ch({ request: { type: "select", min: 1, max: 2, distinctNames: true, options: [o("a"), o("b"), o("d", { defId: "OP01-029" })] } as never });
    expect(intent(same, ans({ selectedOptionIds: ["a", "b"] }), nameOf)).toBeNull();
    expect(intent(same, ans({ selectedOptionIds: ["a", "d"] }), nameOf)).toMatchObject({ selectedOptionIds: ["a", "d"] });
  });

  it("builds a mode from exactly one eligible option (#725)", () => {
    const mode = ch({ request: { type: "mode", options: [o("m1"), o("m2"), o("m3", { eligible: false })] } as never });
    expect(intent(mode, ans({ selectedOptionIds: ["m2"] }))).toEqual({ type: "resolve_pending_choice", accept: true, selectedOptionIds: ["m2"] });
    for (const bad of [[], ["m1", "m2"], ["m3"]]) expect(intent(mode, ans({ selectedOptionIds: bad }))).toBeNull();
  });

  it("declines only what can be declined, and accepts nothing when only declining is legal (#725)", () => {
    expect(intent(ch({ optional: true }), ans({ accept: false }))).toEqual({ type: "resolve_pending_choice", accept: false });
    expect(intent(ch({}), ans({ accept: false }))).toBeNull();
    expect(intent(ch({ kind: "life_trigger" }), ans({ accept: false }))).toEqual({ type: "resolve_pending_choice", accept: false });
    expect(intent(ch({ kind: "life_trigger", noTrigger: true }), ans({}))).toBeNull();
    expect(intent(ch({ unpayable: true }), ans({}))).toBeNull();
    expect(intent(ch({ unpayable: true }), ans({ accept: false }))).toEqual({ type: "resolve_pending_choice", accept: false });
  });

  it("accepts a confirm, and a choice with no request (#725)", () => {
    expect(intent(ch({ request: { type: "confirm" } }), ans({}))).toEqual({ type: "resolve_pending_choice", accept: true });
    expect(intent(ch({}), ans({}))).toEqual({ type: "resolve_pending_choice", accept: true });
  });

  it("orders cards as the board's own prompt does: all in order, or top first with the top ids (#725)", () => {
    const order = (allowTopOrBottom?: true) => ch({ request: { type: "order", destination: "deck", options: [o("a"), o("b"), o("c")], ...(allowTopOrBottom ? { allowTopOrBottom } : {}) } as never });
    expect(intent(order(), ans({ orderedOptionIds: ["c", "a", "b"] }))).toEqual({ type: "resolve_pending_choice", accept: true, orderedOptionIds: ["c", "a", "b"] });
    expect(intent(order(), ans({ orderedOptionIds: ["c", "a"] }))).toBeNull();
    expect(intent(order(), ans({ orderedOptionIds: ["c", "a", "a"] }))).toBeNull();
    expect(intent(order(true), ans({ orderedOptionIds: ["a", "b", "c"], topOptionIds: ["c"] }))).toEqual({ type: "resolve_pending_choice", accept: true, orderedOptionIds: ["c", "a", "b"], topOptionIds: ["c"] });
  });

  it("takes within the look's limits and sends the rest back in order, all on one side for top-or-bottom (#725)", () => {
    const look = (rest: string) => ch({ request: { type: "look", options: [o("a"), o("b"), o("c")], minSelect: 0, maxSelect: 1, groups: [], rest, restLabel: "" } as never });
    expect(intent(look("deck_bottom"), ans({ selectedOptionIds: ["b"], orderedOptionIds: ["c", "a"] }))).toEqual({ type: "resolve_pending_choice", accept: true, selectedOptionIds: ["b"], orderedOptionIds: ["c", "a"] });
    expect(intent(look("deck_bottom"), ans({ selectedOptionIds: ["a", "b"] }))).toBeNull();
    expect(intent(look("deck_bottom"), ans({ selectedOptionIds: ["b"], orderedOptionIds: ["a"] }))).toBeNull();
    expect(intent(look("deck_bottom"), ans({ selectedOptionIds: [], topOptionIds: ["a"] }))).toBeNull();
    expect(intent(look("top_or_bottom"), ans({ selectedOptionIds: [], orderedOptionIds: ["a", "b", "c"], topOptionIds: ["a", "b", "c"] }))).toMatchObject({ topOptionIds: ["a", "b", "c"] });
    expect(intent(look("top_or_bottom"), ans({ selectedOptionIds: [] }))).toMatchObject({ orderedOptionIds: ["a", "b", "c"], topOptionIds: [] });
    expect(intent(look("top_or_bottom"), ans({ selectedOptionIds: [], topOptionIds: ["a"] }))).toBeNull();
  });

  it("orders simultaneous effects with order_pending_effects, only as a permutation of the abilities (#725)", () => {
    const fx = ch({ kind: "order_effects", unorderedChoices: [ch({ id: "u1" }), ch({ id: "u2" })] });
    expect(intent(fx, ans({ orderedOptionIds: ["u2", "u1"] }))).toEqual({ type: "order_pending_effects", orderedIds: ["u2", "u1"] });
    expect(intent(fx, ans({ orderedOptionIds: ["u2"] }))).toBeNull();
    expect(intent(fx, ans({}))).toBeNull();
  });
});

describe("a run Log Pose plays (#725)", () => {
  const p = plan([endTurn]);

  it("is marked auto only when started that way, and its card says so (#725)", () => {
    expect(startRun(p).auto).toBeUndefined();
    expect(startRun(p, true).auto).toBe(true);
    const view = mkView();
    expect(planCardMode(p, startRun(p, true), startRun(p, true), view)).toMatchObject({ kind: "running", auto: true });
    expect(planCardMode(p, startRun(p), startRun(p), view)).not.toHaveProperty("auto");
    expect(planCardMode(p, { ...startRun(p, true), state: "blocked", reason: "x" }, null, view)).toMatchObject({ kind: "blocked", auto: true });
    expect(planCardMode(p, { ...startRun(p, true), state: "choice" }, null, view)).toMatchObject({ kind: "choice", auto: true });
  });

  it("keeps its marker through the executor's steps (#725)", () => {
    const r = stepRun(startRun(p, true), mkView({}, [END]));
    expect(r.run.auto).toBe(true);
    expect(r.send).toEqual(END);
  });
});
