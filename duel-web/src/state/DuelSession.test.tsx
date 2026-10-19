import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/** URL each SDK Client was built with (which game server it dials). */
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

/** The duel room the fake SDK opens; `reclaim` plays the SDK's background seat reclaim. */
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

/** A fresh provider, as after a page load; returns its session API. */
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

    // After the match started, a newer token (another tab, a fresh mint) is assigned pool B.
    rememberAssignedGameServer({ game_server_url: "https://pool-b.example" });
    // A dropped socket comes back with a rotated token, which is saved again.
    await room.reclaim("room-1:tok2");

    // Page reload: a new provider resumes from sessionStorage.
    sdkClientUrls.length = 0;
    const after = mountSession();
    void after.tryResumeFromStorage();
    await vi.waitFor(() => expect(sdkReconnect).toHaveBeenCalledWith("room-1:tok2"));
    expect(sdkClientUrls).toEqual(["https://pool-a.example"]);
  });
});
