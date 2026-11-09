import { describe, expect, it, vi } from "vitest";
import type { ChatLine, DiceStateMessage, PlayerView, RematchState } from "../net/protocol";
import {
  CHAT_KEEP,
  classifyServerError,
  createInitialMatchState,
  createMatchStore,
  matchReducer,
  SPECTATOR_CAP_MESSAGE,
  type MatchAction,
  type MatchMode,
  type MatchState,
  type WelcomeInfo,
} from "./matchStore";

const card = (id: string, defId: string) => ({ id, defId });

/** The few view fields the store reads (seat, spectator, turn, board cards); the rest is the board's business. */
function viewOf(seat: 0 | 1, opts: { turn?: number; spectator?: boolean; chars?: string[] } = {}): PlayerView {
  return {
    seat,
    turnNumber: opts.turn ?? 1,
    spectator: opts.spectator,
    you: {
      leader: card("L-you", "ST01-001"),
      characters: (opts.chars ?? []).map((id) => card(id, "ST01-002")),
      stage: null,
    },
    opponent: { leader: card("L-opp", "ST01-001"), characters: [], stage: null },
  } as unknown as PlayerView;
}

function welcomeOf(seat: 0 | 1, over: Partial<WelcomeInfo> = {}): WelcomeInfo {
  return { matchId: "m1", seat, view: viewOf(seat), role: "player", ...over };
}

function run(state: MatchState, ...actions: MatchAction[]): MatchState {
  return actions.reduce(matchReducer, state);
}

const line = (id: string, text = id): ChatLine => ({ id, seat: 0, text, at: 1 });
const reveal = { type: "card_revealed", seat: 1, defId: "ST01-009" };

function started(mode: MatchMode = "online", seat: 0 | 1 = 0): MatchState {
  return run(createInitialMatchState(mode, { seat }), { type: "welcome", info: welcomeOf(seat) });
}

describe("match chat", () => {
  it("merges replayed history by id so nothing duplicates, and keeps the newest lines (#425)", () => {
    const s = run(
      createInitialMatchState(),
      { type: "chat", lines: [line("a"), line("b")] },
      { type: "chat", lines: [line("a"), line("b"), line("c")] },
    );
    expect(s.chat.map((l) => l.id)).toEqual(["a", "b", "c"]);

    const many = Array.from({ length: CHAT_KEEP + 5 }, (_, i) => line(`m${i}`));
    const capped = run(createInitialMatchState(), { type: "chat", lines: many });
    expect(capped.chat).toHaveLength(CHAT_KEEP);
    expect(capped.chat[0]!.id).toBe("m5");
  });

  it("keeps the same state object when every line was already seen", () => {
    const s = run(createInitialMatchState(), { type: "chat", lines: [line("a")] });
    expect(matchReducer(s, { type: "chat", lines: [line("a")] })).toBe(s);
  });
});

describe("illegal-intent banner", () => {
  it("a stale rejection clears only an illegal_intent banner (#304)", () => {
    const illegal = run(createInitialMatchState(), {
      type: "error",
      err: { code: "illegal_intent", message: "Not your turn" },
    });
    expect(illegal.errorBanner).toBe("illegal_intent: Not your turn");
    expect(matchReducer(illegal, { type: "staleIllegalIntent" }).errorBanner).toBeNull();

    const other = run(createInitialMatchState(), { type: "error", err: { code: "bad_deck", message: "Illegal deck" } });
    expect(matchReducer(other, { type: "staleIllegalIntent" }).errorBanner).toBe("bad_deck: Illegal deck");
  });
});

describe("server errors", () => {
  const view = { view: null, mode: "online" } as const;

  it("a spectator who arrives before the first deal gets no banner (#346)", () => {
    expect(classifyServerError({ code: "match_not_ready", message: "x" }, view, "spectator")).toEqual({ kind: "ignore" });
    expect(
      classifyServerError({ code: "match_not_ready", message: "x" }, { view: viewOf(0), mode: "online" }, "spectator").kind,
    ).toBe("banner");
  });

  it("a full spectator list and an opponent no-show end the match locally with the reason", () => {
    expect(classifyServerError({ code: "room_full", message: "x" }, view, "spectator")).toEqual({
      kind: "reset",
      text: SPECTATOR_CAP_MESSAGE,
    });
    // A player seat that finds the room full is a plain error, not the spectator cap.
    expect(classifyServerError({ code: "room_full", message: "Room is full" }, view, "player").kind).toBe("banner");
    const gone = run(started(), { type: "error", err: { code: "opponent_no_show", message: "Opponent never arrived" } });
    expect(gone.errorBanner).toBe("Opponent never arrived");
    expect(gone.view).toBeNull();
    expect(gone.matchId).toBeNull();
  });

  it("Colyseus seat-reservation races never reach the banner", () => {
    const s = createInitialMatchState();
    expect(matchReducer(s, { type: "error", err: { code: "x", message: "seat reservation expired" } })).toBe(s);
  });

  it("practice shows every error on the banner, whatever its code", () => {
    expect(classifyServerError({ code: "opponent_no_show", message: "m" }, { view: null, mode: "hotseat" }, "player")).toEqual({
      kind: "banner",
      text: "opponent_no_show: m",
    });
  });
});

describe("welcome", () => {
  it("online: a welcome starts a clean game, clearing the last result, rematch vote and log", () => {
    let s = started();
    s = run(
      s,
      { type: "events", events: [reveal], step: 1 },
      { type: "matchOver", result: { winner: 0, reason: "leader_battle_at_zero_life" } as never },
      { type: "rematchState", state: { available: true } as RematchState },
    );
    expect(s.battleLog).toHaveLength(1);
    const again = matchReducer(s, { type: "welcome", info: welcomeOf(0) });
    expect(again.matchOver).toBeNull();
    expect(again.rematch).toBeNull();
    expect(again.battleLog).toEqual([]);
    expect(again.canReconnect).toBe(true);

    // A resync mid-game (no match over yet) is a clean slate online too.
    const midGame = run(started(), { type: "events", events: [reveal], step: 1 });
    expect(matchReducer(midGame, { type: "welcome", info: welcomeOf(0) }).battleLog).toEqual([]);
  });

  it("practice: a mid-game resync keeps the log, a rematch after match over clears it (#451)", () => {
    let s = started("hotseat");
    s = matchReducer(s, { type: "events", events: [reveal] });
    const resynced = matchReducer(s, { type: "welcome", info: welcomeOf(0) });
    expect(resynced.battleLog).toHaveLength(1);

    const over = run(s, { type: "matchOver", result: { winner: 1, reason: "x" } as never }, {
      type: "rematchState",
      state: { available: true } as RematchState,
    });
    const rematch = matchReducer(over, { type: "welcome", info: welcomeOf(0) });
    expect(rematch.battleLog).toEqual([]);
    expect(rematch.matchOver).toBeNull();
    expect(rematch.rematch).toBeNull();
  });

  it("only a player gets the matchup brief (#401)", () => {
    const brief = { ticket: "t" } as never;
    expect(matchReducer(createInitialMatchState(), { type: "welcome", info: welcomeOf(0, { brief }) }).brief).toBe(brief);
    expect(
      matchReducer(createInitialMatchState(), { type: "welcome", info: welcomeOf(0, { brief, role: "spectator" }) }).brief,
    ).toBeNull();
  });
});

describe("opening dice roll (#1190)", () => {
  const dice = {
    protocolVersion: 5,
    roller: 1,
    caller: 0,
    step: "roll",
    call: "high",
    roll: null,
    winner: null,
    deadline: 1,
    seat: 0,
    role: "player",
  } as unknown as DiceStateMessage;

  it("keeps the roll in progress until the game's welcome arrives, which keeps its result for the banner", () => {
    const rolling = matchReducer(createInitialMatchState(), { type: "diceState", state: dice });
    expect(rolling.dice).toBe(dice);
    const result = { roller: 1, caller: 0, call: "high", roll: 5, winner: 0 } as const;
    const started = matchReducer(rolling, { type: "welcome", info: welcomeOf(0, { dice: result }) });
    expect(started.dice).toBeNull();
    expect(started.firstSeatDice).toEqual(result);
    // A rematch's welcome carries none, and clears the last game's.
    expect(matchReducer(started, { type: "welcome", info: welcomeOf(0, { dice: null }) }).firstSeatDice).toBeNull();
  });

  it("a cancelled roll (a seat left) sends the board back to waiting", () => {
    const rolling = matchReducer(createInitialMatchState(), { type: "diceState", state: dice });
    expect(matchReducer(rolling, { type: "diceState", state: { ...dice, step: "cancelled" } }).dice).toBeNull();
  });
});

describe("battle log", () => {
  it("events append in arrival order, each stamped with the room's step (#497)", () => {
    const s = run(
      started(),
      { type: "events", events: [reveal], step: 3 },
      { type: "events", events: [{ type: "card_revealed", seat: 1, defId: "ST01-006" }], step: 4 },
    );
    expect(s.battleLog.map((l) => l.step)).toEqual([3, 4]);
    expect(s.battleLog.map((l) => l.turn)).toEqual([1, 1]);
  });

  it("narrates against the current view's turn, and a spectator is not 'You'", () => {
    const s = run(
      createInitialMatchState("online", { seat: 0 }),
      { type: "welcome", info: welcomeOf(0, { view: viewOf(0, { turn: 4, spectator: true }), role: "spectator" }) },
      { type: "events", events: [{ type: "card_revealed", seat: 0, defId: "ST01-009" }] },
    );
    expect(s.battleLog[0]!.turn).toBe(4);
    expect(s.battleLog[0]!.text).not.toMatch(/^You /);
    const player = run(started(), { type: "events", events: [{ type: "card_revealed", seat: 0, defId: "ST01-009" }] });
    expect(player.battleLog[0]!.text).toMatch(/^You reveal/);
  });

  it("an undo drops the lines past its step and adds the marker (#497)", () => {
    const s = run(
      started(),
      { type: "events", events: [reveal], step: 1 },
      { type: "events", events: [reveal], step: 2 },
      { type: "undoApplied", info: { toTurn: 1, toStep: 1, by: 0, action: null, scope: "action" } },
    );
    expect(s.battleLog.map((l) => l.step)).toEqual([1, 1]);
    expect(s.battleLog[1]!.text).toBe("You undid the last action.");
  });

  it("names a card from an earlier view even after it left the board (instance index grows, never mutates)", () => {
    const first = run(started(), { type: "view", view: viewOf(0, { chars: ["c1"] }) });
    const before = first.instances;
    const second = matchReducer(first, { type: "view", view: viewOf(0, { chars: ["c2"] }) });
    expect(second.instances.has("c1")).toBe(true);
    expect(second.instances.has("c2")).toBe(true);
    expect(before.has("c2")).toBe(false);
  });
});

describe("connection state", () => {
  it("a taken-over seat freezes the board and cancels every way back in (#451)", () => {
    const s = run(started(), { type: "drop" }, { type: "takenOver" });
    expect(s).toMatchObject({
      takenOver: true,
      connected: false,
      reconnecting: false,
      canReconnect: false,
      queueing: false,
      resuming: false,
    });
    expect(s.view).not.toBeNull();
  });

  it("a finished match can no longer be reconnected to", () => {
    const s = run(started(), { type: "matchOver", result: { winner: 0, reason: "x" } as never });
    expect(s.canReconnect).toBe(false);
  });

  it("a dropped socket is reconnecting until the SDK reclaims the seat", () => {
    const dropped = run(started(), { type: "drop" });
    expect(dropped).toMatchObject({ connected: false, reconnecting: true });
    expect(matchReducer(dropped, { type: "reconnect" })).toMatchObject({ connected: true, reconnecting: false });
  });

  it("leaving resets the match but keeps the error that sent the player back to the lobby", () => {
    const s = run(
      started(),
      { type: "chat", lines: [line("a")] },
      { type: "setError", message: "boom" },
      { type: "reset" },
    );
    expect(s).toMatchObject({ view: null, matchId: null, seat: null, connected: false, chat: [], errorBanner: "boom" });
  });

  it("only the seat that was sent gets its skin", () => {
    const skin = { playmat: null, cardBack: null, donArt: null } as never;
    const s = matchReducer(createInitialMatchState(), { type: "skin", msg: { seat: 1, skin } as never });
    expect(s.seatSkins).toEqual([null, skin]);
  });
});

describe("match store", () => {
  it("notifies subscribers only when the state changed, and unsubscribes", () => {
    const store = createMatchStore();
    const seen = vi.fn();
    const off = store.subscribe(seen);
    store.dispatch({ type: "staleIllegalIntent" });
    expect(seen).not.toHaveBeenCalled();
    store.dispatch({ type: "setError", message: "x" });
    expect(seen).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().errorBanner).toBe("x");
    off();
    store.dispatch({ type: "setError", message: "y" });
    expect(seen).toHaveBeenCalledTimes(1);
  });
});
