import { afterEach, describe, expect, it, vi } from "vitest";

const sdkReconnect = vi.fn((_token: string) => new Promise<never>(() => {}));
const sdkCreate = vi.fn((_name: string, _opts: unknown): Promise<unknown> => new Promise<never>(() => {}));
vi.mock("@colyseus/sdk", () => ({
  Client: class {
    reconnect(token: string) {
      return sdkReconnect(token);
    }
    create(name: string, opts: unknown) {
      return sdkCreate(name, opts);
    }
  },
}));

import { DuelClient } from "./duelClient";

type Listener = (...args: unknown[]) => void;

/** Just enough of a Colyseus Room for DuelClient's wiring and liveness check. */
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

/** Attach a fake room the way connect() does after a successful join. */
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

describe("a connect superseded by a newer one (#PRNUM)", () => {
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
