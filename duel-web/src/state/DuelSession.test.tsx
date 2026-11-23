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
  onLeave: () => {},
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
