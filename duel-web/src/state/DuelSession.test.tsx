import { useContext } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const sdkClientUrls: string[] = [];
const sdkReconnect = vi.fn((_token: string) => new Promise<never>(() => {}));
vi.mock("@colyseus/sdk", () => ({
  Client: class {
    constructor(url: string) {
      sdkClientUrls.push(url);
    }
    reconnect(token: string) {
      return sdkReconnect(token);
    }
    async create() {
      return room;
    }
  },
}));

const room = {
  roomId: "room-1",
  reconnectionToken: "room-1:tok",
  connection: { isOpen: true, close: () => {} },
  reconnection: { enabled: true, isReconnecting: false },
  onMessage: () => {},
  onDrop: () => {},
  leaveCb: null as null | ((code: number) => void),
  onLeave(cb: (code: number) => void) {
    room.leaveCb = cb;
  },
  onError: () => {},
  leave: async () => 1000,
  reconnectCb: null as null | (() => void),
  onReconnect(cb: () => void) {
    room.reconnectCb = cb;
  },
  async reclaim(newToken: string) {
    room.reconnectCb?.();
    room.reconnectionToken = newToken;
    await Promise.resolve();
  },
};

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
}
vi.stubGlobal("localStorage", memoryStorage());
vi.stubGlobal("sessionStorage", memoryStorage());

const { DuelSessionProvider, useDuelSession } = await import("./DuelSession");
const { rememberAssignedGameServer } = await import("../net/gameServer");
const { MatchStoreContext } = await import("./useMatch");

function mountSession(): ReturnType<typeof useDuelSession> {
  let session: ReturnType<typeof useDuelSession> | null = null;
  function Grab() {
    session = useDuelSession();
    return null;
  }
  renderToStaticMarkup(
    <DuelSessionProvider>
      <Grab />
    </DuelSessionProvider>,
  );
  if (!session) throw new Error("no session");
  return session;
}

describe("match resume across game server pools", () => {
  it("a resumed match reconnects to the server it was created on, even when a newer token names another pool (#389)", async () => {
    const before = mountSession();
    await before.connect({ serverUrl: "https://pool-a.example", gameToken: "t", preferredSeat: 0 }, 0);

    rememberAssignedGameServer({ game_server_url: "https://pool-b.example" });
    await room.reclaim("room-1:tok2");

    sdkClientUrls.length = 0;
    const after = mountSession();
    void after.tryResumeFromStorage();
    await vi.waitFor(() => expect(sdkReconnect).toHaveBeenCalledWith("room-1:tok2"));
    expect(sdkClientUrls).toEqual(["https://pool-a.example"]);
  });
});

describe("leaving a match", () => {
  it("leaving after a rematch error clears the banner so the home page shows none (#1432)", async () => {
    let session: ReturnType<typeof useDuelSession> | null = null;
    let store: import("./matchStore").MatchStore | null = null;
    function Grab() {
      session = useDuelSession();
      store = useContext(MatchStoreContext);
      return null;
    }
    renderToStaticMarkup(
      <DuelSessionProvider>
        <Grab />
      </DuelSessionProvider>,
    );
    store!.dispatch({ type: "setError", message: "match_not_ready: Rematch isn't available right now" });
    expect(store!.getSnapshot().errorBanner).not.toBeNull();
    await session!.leave();
    expect(store!.getSnapshot().errorBanner).toBeNull();
  });
});

describe("a game the server no longer has (#1500)", () => {
  function mountWithStore() {
    let session: ReturnType<typeof useDuelSession> | null = null;
    let store: import("./matchStore").MatchStore | null = null;
    function Grab() {
      session = useDuelSession();
      store = useContext(MatchStoreContext);
      return null;
    }
    renderToStaticMarkup(
      <DuelSessionProvider>
        <Grab />
      </DuelSessionProvider>,
    );
    return { session: session!, store: store! };
  }

  async function joined(bootId: string) {
    const t = mountWithStore();
    await t.session.connect({ serverUrl: "https://pool-a.example", gameToken: "t", preferredSeat: 0 }, 0);
    t.store.dispatch({ type: "bootId", id: bootId });
    return t;
  }

  const health = (processId: string) =>
    vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => ({ processId }) }));

  it("a room that is gone after a restart ends the game as lost instead of leaving a Reconnect button (#1500)", async () => {
    health("after");
    const { session, store } = await joined("before");
    sdkReconnect.mockImplementationOnce(() => Promise.reject(new Error('room "room-1" has been disposed.')));
    await expect(session.reconnect()).rejects.toThrow(/disposed/);
    expect(store.getSnapshot()).toMatchObject({ lostGame: true, canReconnect: false, reconnecting: false });
  });

  it("a room that is gone while the server kept running is not reported as a restart (#1500)", async () => {
    health("same");
    const { session, store } = await joined("same");
    sdkReconnect.mockImplementationOnce(() => Promise.reject(new Error('room "room-1" has been disposed.')));
    await expect(session.reconnect()).rejects.toThrow();
    expect(store.getSnapshot().lostGame).toBe(false);
    expect(store.getSnapshot().errorBanner).toMatch(/no longer running/);
  });

  it("a connection the SDK gave up on is retried here without a tap, shown as Reconnecting (#1500)", async () => {
    health("before");
    const { store } = await joined("before");
    sdkReconnect.mockImplementation(() => new Promise<never>(() => {}));
    sdkReconnect.mockClear();
    room.leaveCb!(1006);
    await vi.waitFor(() => expect(sdkReconnect).toHaveBeenCalled());
    expect(store.getSnapshot()).toMatchObject({ reconnecting: true, canReconnect: true, lostGame: false });
  });

  it("remembers the decks and the bot for a rematch, and keeps them across a reload (#1500)", async () => {
    sessionStorage.removeItem("optcg.duel.matchResume.v1");
    health("after");
    const deck = { leaderId: "ST01-001", deck: ["ST01-002"] };
    const bot = { level: "hard" as const, deck: { leaderId: "ST01-001", deck: ["ST01-003"] } };
    const before = mountWithStore();
    await before.session.connect({ serverUrl: "https://pool-a.example", gameToken: "t", preferredSeat: 0, deck, createOptions: { bot } }, 0);
    const plan = { deck, bot, opponentName: null };
    expect(before.store.getSnapshot().rematchPlan).toEqual(plan);

    const reloaded = mountWithStore();
    sdkReconnect.mockImplementationOnce(() => Promise.reject(new Error('room "room-1" has been disposed.')));
    expect(await reloaded.session.tryResumeFromStorage()).toBe(false);
    expect(reloaded.store.getSnapshot()).toMatchObject({ lostGame: true, rematchPlan: plan });
  });

  it("a dropped network keeps showing Reconnecting and never claims a restart (#1500)", async () => {
    health("after");
    const { session, store } = await joined("before");
    sdkReconnect.mockImplementation(() => Promise.reject(new TypeError("Failed to fetch")));
    void session.reconnect().catch(() => undefined);
    await vi.waitFor(() => expect(sdkReconnect.mock.calls.length).toBeGreaterThan(1), { timeout: 5000 });
    expect(store.getSnapshot()).toMatchObject({ reconnecting: true, lostGame: false, canReconnect: true });
    await session.leave();
    sdkReconnect.mockImplementation(() => new Promise<never>(() => {}));
  }, 10_000);
});
