import { afterEach, describe, expect, it, vi } from "vitest";

const sdkReconnect = vi.fn((_token: string) => new Promise<never>(() => {}));
const sdkJoinOrCreate = vi.fn((_name: string, _opts: unknown): Promise<unknown> => new Promise<never>(() => {}));
const sdkCreate = vi.fn((_name: string, _opts: unknown): Promise<unknown> => new Promise<never>(() => {}));
const sdkJoinById = vi.fn((_id: string, _opts: unknown): Promise<unknown> => new Promise<never>(() => {}));
const sdkClientUrls: string[] = [];
vi.mock("@colyseus/sdk", () => ({
  Client: class {
    constructor(url: string) {
      sdkClientUrls.push(url);
    }
    joinById(id: string, opts: unknown) {
      return sdkJoinById(id, opts);
    }
    reconnect(token: string) {
      return sdkReconnect(token);
    }
    joinOrCreate(name: string, opts: unknown) {
      return sdkJoinOrCreate(name, opts);
    }
    create(name: string, opts: unknown) {
      return sdkCreate(name, opts);
    }
  },
}));

import { DuelClient } from "./duelClient";
import { rememberAssignedGameServer } from "./gameServer";
import { PROTOCOL_VERSION } from "./protocol";

type Listener = (...args: unknown[]) => void;

function fakeRoom(opts: { answersPing: boolean }) {
  const listeners: Record<string, Listener[]> = {};
  const on = (name: string) => (cb: Listener) => {
    (listeners[name] ??= []).push(cb);
  };
  const room = {
    roomId: "r",
    reconnectionToken: "r:first",
    connection: { isOpen: true, close: vi.fn() },
    reconnection: { enabled: true, isReconnecting: false },
    onMessage: vi.fn(),
    send: vi.fn(),
    onDrop: on("drop"),
    onReconnect: on("reconnect"),
    onLeave: on("leave"),
    onError: on("error"),
    leave: vi.fn(async () => 1000),
    ping: vi.fn((cb: (ms: number) => void) => {
      if (opts.answersPing) cb(12);
    }),
    emit(name: string, ...args: unknown[]) {
      for (const cb of listeners[name] ?? []) cb(...args);
    },
  };
  return room;
}

function attach(client: DuelClient, room: ReturnType<typeof fakeRoom>) {
  const internals = client as unknown as {
    room: unknown;
    captureReconnectionToken: (r: unknown) => void;
    wireDuel: (r: unknown) => void;
  };
  internals.room = room;
  internals.captureReconnectionToken(room);
  internals.wireDuel(room);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("DuelClient background reconnect", () => {
  it("adopts the rotated reconnection token after the SDK reclaims the seat", async () => {
    const client = new DuelClient();
    const onReconnectionToken = vi.fn();
    const onReconnect = vi.fn();
    client.setHandlers({ onReconnectionToken, onReconnect });
    const room = fakeRoom({ answersPing: true });
    attach(client, room);
    expect(client.getReconnectionToken()).toBe("r:first");

    // Same order as the SDK: onReconnect fires, then the new token is stored.
    room.emit("reconnect");
    room.reconnectionToken = "r:second";
    await Promise.resolve();

    expect(client.getReconnectionToken()).toBe("r:second");
    expect(onReconnectionToken).toHaveBeenLastCalledWith("r:second", "r");
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it("tells a live socket from one that never answers after the app was in the background", async () => {
    vi.useFakeTimers();
    const live = new DuelClient();
    attach(live, fakeRoom({ answersPing: true }));
    await expect(live.isAlive(3000)).resolves.toBe(true);

    const stale = new DuelClient();
    attach(stale, fakeRoom({ answersPing: false }));
    const result = stale.isAlive(3000);
    await vi.advanceTimersByTimeAsync(3000);
    await expect(result).resolves.toBe(false);
  });

  it("ignores drop events from a room it already left", async () => {
    const client = new DuelClient();
    const onDrop = vi.fn();
    client.setHandlers({ onDrop });
    const room = fakeRoom({ answersPing: true });
    attach(client, room);

    room.emit("drop", 1006);
    expect(onDrop).toHaveBeenCalledTimes(1);

    await client.disconnect();
    room.emit("drop", 1006);
    expect(onDrop).toHaveBeenCalledTimes(1);
  });

  it("reclaims the seat once when two callers ask to reconnect together", () => {
    const client = new DuelClient();
    const first = client.reconnect({ serverUrl: "http://gs", reconnectionToken: "r:tok" });
    const second = client.reconnect({ serverUrl: "http://gs", reconnectionToken: "r:tok" });
    expect(second).toBe(first);
    expect(sdkReconnect).toHaveBeenCalledTimes(1);
  });
});

describe("DuelClient undo plumbing (#497)", () => {
  const messageHandler = (room: ReturnType<typeof fakeRoom>, type: string) =>
    room.onMessage.mock.calls.find((c) => c[0] === type)![1] as (raw: unknown) => void;

  it("hands the room's intent count to the events handler so an undo can trim the log (#497)", () => {
    const client = new DuelClient();
    const onEvents = vi.fn();
    client.setHandlers({ onEvents });
    const room = fakeRoom({ answersPing: true });
    attach(client, room);
    messageHandler(room, "events")({ protocolVersion: PROTOCOL_VERSION, events: [{ type: "x" }], step: 7 });
    expect(onEvents).toHaveBeenCalledWith([{ type: "x" }], 7);
    messageHandler(room, "events")({ protocolVersion: PROTOCOL_VERSION, events: [] });
    expect(onEvents).toHaveBeenLastCalledWith([], undefined);
  });

  it("an undo accept names the request it was shown, and a request carries no id (#540)", () => {
    const client = new DuelClient();
    const room = fakeRoom({ answersPing: true });
    attach(client, room);
    client.sendUndo("accept", { id: 7 });
    expect(room.send).toHaveBeenLastCalledWith("undo", { protocolVersion: PROTOCOL_VERSION, action: "accept", id: 7 });
    client.sendUndo("request", { scope: "turn", id: 7 });
    expect(room.send).toHaveBeenLastCalledWith("undo", { protocolVersion: PROTOCOL_VERSION, action: "request", scope: "turn" });
  });
});

describe("DuelClient queue", () => {
  it("stops searching when the queue room closes before a match (#302)", async () => {
    vi.useFakeTimers();
    const queueRoom = fakeRoom({ answersPing: true });
    sdkJoinOrCreate.mockResolvedValueOnce(queueRoom);
    const client = new DuelClient();
    const queued = client.queueMatch({ serverUrl: "ws://test", devUserId: "a" });
    queued.catch(() => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(sdkJoinOrCreate).toHaveBeenCalledWith("ranked_queue", expect.anything());
    queueRoom.emit("leave", 1006);
    await vi.advanceTimersByTimeAsync(120_000);
    await expect(queued).rejects.toThrow(/Lost the queue/);
  });

  it("joins the casual pool, not the ranked one, when asked for a casual game (#1506)", async () => {
    vi.useFakeTimers();
    const queueRoom = fakeRoom({ answersPing: true });
    sdkJoinOrCreate.mockClear();
    sdkJoinOrCreate.mockResolvedValueOnce(queueRoom);
    const client = new DuelClient();
    const queued = client.queueMatch({ serverUrl: "ws://test", devUserId: "a" }, "casual");
    queued.catch(() => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(sdkJoinOrCreate).toHaveBeenCalledWith("casual_queue", expect.anything());
    expect(sdkJoinOrCreate).not.toHaveBeenCalledWith("ranked_queue", expect.anything());
    queueRoom.emit("leave", 1006);
    await vi.advanceTimersByTimeAsync(120_000);
    await expect(queued).rejects.toThrow();
  });
});

describe("a connect superseded by a newer one (#313)", () => {
  it("leaves the room it opened instead of keeping the seat", async () => {
    const older = fakeRoom({ answersPing: true });
    older.roomId = "older";
    const newer = fakeRoom({ answersPing: true });
    newer.roomId = "newer";
    let openOlder: (room: unknown) => void = () => {};
    sdkCreate
      .mockImplementationOnce(() => new Promise((resolve) => (openOlder = resolve)))
      .mockImplementationOnce(async () => newer);

    const client = new DuelClient();
    const first = client.connect({ preferredSeat: 0 });
    await vi.waitFor(() => expect(sdkCreate).toHaveBeenCalledTimes(1));
    await client.connect({ preferredSeat: 0 });
    // The older create answers last, as when two Invite / Join taps race.
    openOlder(older);
    await expect(first).rejects.toThrow();

    expect(older.leave).toHaveBeenCalled();
    expect(newer.leave).not.toHaveBeenCalled();
    expect(client.roomId).toBe("newer");
  });
});

describe("game server pools", () => {
  it("reconnects to the game server the match was created on, not a newer token's pool (#389)", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    sdkCreate.mockImplementationOnce(async () => fakeRoom({ answersPing: true }));
    const client = new DuelClient();
    await client.connect({ serverUrl: "https://pool-a.example", preferredSeat: 0 });
    expect(client.serverUrl).toBe("https://pool-a.example");

    rememberAssignedGameServer({ game_server_url: "https://pool-b.example" });
    sdkClientUrls.length = 0;
    void client.reconnect();
    await vi.waitFor(() => expect(sdkReconnect).toHaveBeenCalled());
    expect(sdkClientUrls).toEqual(["https://pool-a.example"]);
    vi.unstubAllGlobals();
  });
});

describe("DuelClient turn guard", () => {
  type Handler = (raw: unknown) => void;
  function wired() {
    const client = new DuelClient();
    const onStaleIllegalIntent = vi.fn();
    client.setHandlers({ onStaleIllegalIntent });
    const room = Object.assign(fakeRoom({ answersPing: true }), { send: vi.fn() });
    attach(client, room);
    const handler = (name: string) =>
      room.onMessage.mock.calls.find((c) => c[0] === name)![1] as Handler;
    const view = (turnNumber: number, activeSeat: 0 | 1) =>
      handler("view")({
        protocolVersion: PROTOCOL_VERSION,
        view: { seat: 0, activeSeat, turnNumber, phase: "main", you: { hand: [] }, opponent: { handCount: 5 }, pendingChoices: [], legalIntents: [] },
      });
    const error = (code: string, message: string) =>
      handler("error")({ protocolVersion: PROTOCOL_VERSION, code, message });
    const sent = () => room.send.mock.calls.map((c) => (c[1] as { intent: { type: string } }).intent.type);
    return { client, room, view, error, sent, onStaleIllegalIntent };
  }

  it("drops a second End turn or a card action sent before the turn's result arrives (#328)", () => {
    const t = wired();
    t.view(3, 0);
    t.client.sendIntent({ type: "end_turn" });
    t.client.sendIntent({ type: "end_turn" });
    t.client.sendIntent({ type: "play_card", handIndex: 0 });
    expect(t.sent()).toEqual(["end_turn"]);
    t.view(4, 1);
    t.view(5, 0);
    t.client.sendIntent({ type: "play_card", handIndex: 0 });
    expect(t.sent()).toEqual(["end_turn", "play_card"]);
  });

  it("sends one Pass block when a tap races the automatic pass, and passes again on the next step (#445)", () => {
    const t = wired();
    t.view(3, 1);
    t.client.sendIntent({ type: "pass_block" });
    t.client.sendIntent({ type: "pass_block" });
    expect(t.sent()).toEqual(["pass_block"]);
    t.view(3, 1);
    t.client.sendIntent({ type: "pass_counter" });
    t.client.sendIntent({ type: "pass_counter" });
    expect(t.sent()).toEqual(["pass_block", "pass_counter"]);
    t.view(3, 1);
    t.client.sendIntent({ type: "pass_counter" });
    expect(t.sent()).toEqual(["pass_block", "pass_counter", "pass_counter"]);
    t.error("illegal_intent", "Counter step: use a Counter or pass");
    t.client.sendIntent({ type: "pass_counter" });
    expect(t.sent()).toEqual(["pass_block", "pass_counter", "pass_counter", "pass_counter"]);
  });

  it("still answers an end-of-turn prompt after End turn (#328)", () => {
    const t = wired();
    t.view(3, 0);
    t.client.sendIntent({ type: "end_turn" });
    t.view(3, 0);
    t.client.sendIntent({ type: "resolve_pending_choice", accept: true });
    expect(t.sent()).toEqual(["end_turn", "resolve_pending_choice"]);
  });

  it("lets you act again when the server rejects the End turn (#328)", () => {
    const t = wired();
    t.view(3, 0);
    t.client.sendIntent({ type: "end_turn" });
    t.error("illegal_intent", "Resolve the pending effect first");
    t.view(3, 0);
    t.client.sendIntent({ type: "end_turn" });
    expect(t.sent()).toEqual(["end_turn", "end_turn"]);
  });

  it("lets you act again after the socket reconnects (#328)", async () => {
    const t = wired();
    t.view(3, 0);
    t.client.sendIntent({ type: "end_turn" });
    t.room.emit("reconnect");
    await Promise.resolve();
    t.client.sendIntent({ type: "end_turn" });
    expect(t.sent()).toEqual(["end_turn", "end_turn"]);
  });

  it("reports a rejected action stale once the turn changes, not before (#328)", () => {
    const t = wired();
    t.view(4, 1);
    t.error("illegal_intent", "Not your turn");
    t.view(4, 1);
    expect(t.onStaleIllegalIntent).not.toHaveBeenCalled();
    t.view(5, 0);
    expect(t.onStaleIllegalIntent).toHaveBeenCalledTimes(1);
    t.view(5, 0);
    expect(t.onStaleIllegalIntent).toHaveBeenCalledTimes(1);
  });
});

describe("DuelClient stale-intent guards (#1351)", () => {
  function wired() {
    const client = new DuelClient();
    const room = Object.assign(fakeRoom({ answersPing: true }), { send: vi.fn() });
    attach(client, room);
    const handler = (name: string) =>
      room.onMessage.mock.calls.find((c) => c[0] === name)![1] as (raw: unknown) => void;
    const view = (step?: number) =>
      handler("view")({
        protocolVersion: PROTOCOL_VERSION,
        view: {
          seat: 0,
          activeSeat: 0,
          turnNumber: 3,
          phase: "main",
          you: { hand: [{ id: "c-a" }, { id: "c-b" }] },
          opponent: { handCount: 5 },
          pendingChoices: [],
          legalIntents: [],
        },
        ...(step === undefined ? {} : { step }),
      });
    const bodies = () => room.send.mock.calls.map((c) => c[1] as Record<string, unknown>);
    return { client, handler, view, bodies };
  }

  it("sends the step of the view it acted on, and the instance id for a hand-index intent", () => {
    const t = wired();
    t.view(41);
    t.client.sendIntent({ type: "play_card", handIndex: 1 });
    t.view(42);
    t.client.sendIntent({ type: "counter_from_hand", handIndex: 0 });
    t.client.sendIntent({ type: "give_don", donId: "d1", targetId: "t1" });
    const [play, counter, give] = t.bodies();
    expect(play).toMatchObject({ step: 41, cardId: "c-b" });
    expect(counter).toMatchObject({ step: 42, cardId: "c-a" });
    expect(give!.step).toBe(42);
    expect(give).not.toHaveProperty("cardId");
  });

  it("sends no step before the server has sent one (old server)", () => {
    const t = wired();
    t.view();
    t.client.sendIntent({ type: "end_turn" });
    expect(t.bodies()[0]).not.toHaveProperty("step");
  });

  it("lets End turn go out again after the server answers stale_intent", () => {
    const t = wired();
    t.view(5);
    t.client.sendIntent({ type: "end_turn" });
    t.handler("error")({ protocolVersion: PROTOCOL_VERSION, code: "stale_intent", message: "State changed" });
    t.view(6);
    t.client.sendIntent({ type: "end_turn" });
    expect(t.bodies().map((b) => b.step)).toEqual([5, 6]);
  });
});

describe("DuelClient server restart warning (#1352)", () => {
  function restartSetup() {
    const client = new DuelClient();
    const onServerRestarting = vi.fn();
    const onError = vi.fn();
    client.setHandlers({ onServerRestarting, onError });
    const room = fakeRoom({ answersPing: true });
    attach(client, room);
    const message = (payload: unknown) =>
      (room.onMessage.mock.calls.find((c) => c[0] === "server_restarting")![1] as (raw: unknown) => void)(payload);
    return { onServerRestarting, onError, message };
  }

  it("server_restarting tells the app how long is left, and a malformed one is ignored without an error banner (#1352)", () => {
    const t = restartSetup();
    t.message({ protocolVersion: PROTOCOL_VERSION, seconds: 10 });
    expect(t.onServerRestarting).toHaveBeenCalledWith(10);
    t.message({ seconds: 10 });
    expect(t.onServerRestarting).toHaveBeenCalledTimes(1);
    expect(t.onError).not.toHaveBeenCalled();
  });
});

describe("DuelClient takeover (#451)", () => {
  function takenOverSetup() {
    const client = new DuelClient();
    const onTakenOver = vi.fn();
    const onDrop = vi.fn();
    const onDisconnect = vi.fn();
    client.setHandlers({ onTakenOver, onDrop, onDisconnect });
    const room = fakeRoom({ answersPing: true });
    attach(client, room);
    const message = (name: string, payload: unknown = {}) =>
      (room.onMessage.mock.calls.find((c) => c[0] === name)![1] as (raw: unknown) => void)(payload);
    return { client, room, onTakenOver, onDrop, onDisconnect, message };
  }

  it("taken_over turns the SDK's auto-reconnect off and tells the app once", () => {
    const t = takenOverSetup();
    t.message("taken_over", { seat: 0 });
    t.message("taken_over", { seat: 0 });
    expect(t.room.reconnection.enabled).toBe(false);
    expect(t.onTakenOver).toHaveBeenCalledTimes(1);
    expect(t.client.takenOver).toBe(true);
    expect(t.client.getReconnectionToken()).toBeNull();
  });

  it("a takeover close (4451) counts as taken over", () => {
    const t = takenOverSetup();
    t.room.emit("leave", 4451);
    expect(t.onTakenOver).toHaveBeenCalledTimes(1);
    expect(t.onDisconnect).toHaveBeenCalledWith(4451);
  });

  it("an ordinary drop is not a takeover", () => {
    const t = takenOverSetup();
    t.room.emit("drop", 1006);
    expect(t.onTakenOver).not.toHaveBeenCalled();
    expect(t.onDrop).toHaveBeenCalledWith(1006);
    expect(t.room.reconnection.enabled).toBe(true);
  });

  it("refuses to reconnect a seat that moved to another device", async () => {
    const t = takenOverSetup();
    t.message("taken_over");
    sdkReconnect.mockClear();
    await expect(t.client.reconnect({ serverUrl: "http://gs", reconnectionToken: "r:tok" })).rejects.toThrow(
      /another device/,
    );
    expect(sdkReconnect).not.toHaveBeenCalled();
  });

  it("sends takeover and ownerToken in the join options", async () => {
    const room = fakeRoom({ answersPing: true });
    sdkJoinById.mockResolvedValueOnce(room);
    const client = new DuelClient();
    await client.connect({
      roomId: "abc",
      preferredSeat: 1,
      gameToken: "tok",
      takeover: true,
      ownerToken: "owner",
    });
    expect(sdkJoinById).toHaveBeenCalledWith(
      "abc",
      expect.objectContaining({ preferredSeat: 1, takeover: true, ownerToken: "owner" }),
    );
  });
});
