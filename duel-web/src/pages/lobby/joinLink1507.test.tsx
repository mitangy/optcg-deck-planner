// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SavedDeck } from "../../decks/storage";
import { JOIN_FAILED_MESSAGE, JOIN_TIMEOUT_MS, pickInviteDeck, rememberOwnRoom, takeJoinFallback } from "../../net/joinLinks";
import { saveMatchResume } from "../../net/matchResume";

const h = vi.hoisted(() => ({
  launches: [] as Array<Record<string, unknown>>,
  tasks: [] as Array<(gen: number) => Promise<void>>,
  connect: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock("../../state/DuelSession", async () => {
  const actual = await vi.importActual<typeof import("../../state/DuelSession")>("../../state/DuelSession");
  return {
    ...actual,
    useDuelSession: () => ({
      client: { disconnect: h.disconnect, roomId: null, serverUrl: "" },
      connect: h.connect,
      queueRanked: vi.fn(),
      setRating: () => undefined,
      takeOver: vi.fn(),
      startMatch: (launch: Record<string, unknown>, task: (gen: number) => Promise<void>) => {
        h.launches.push(launch);
        h.tasks.push(task);
      },
    }),
  };
});
vi.mock("../../net/api", async () => {
  const actual = await vi.importActual<typeof import("../../net/api")>("../../net/api");
  return {
    ...actual,
    mintGuestGameToken: async () => ({ token: "guest-token", rating: 1000 }),
    warmDuelServices: () => undefined,
  };
});

import { LaunchCancelledError } from "../../state/DuelSession";
import { useMatchLaunchers } from "./useMatchLaunchers";

const deck = (id: string, leaderId: string): SavedDeck => ({ id, name: id, leaderId, cards: ["A", "B"], updatedAt: 1 });
const SELECTED = deck("selected", "OP01-001");
const PLAYED = deck("played", "ST01-001");

let root: Root | null = null;
let host: HTMLElement | null = null;
let current: ReturnType<typeof useMatchLaunchers> | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  h.launches.length = 0;
  h.tasks.length = 0;
  h.connect.mockReset();
  h.disconnect.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function Harness({ joinRoomId }: { joinRoomId: string | null }) {
  current = useMatchLaunchers({
    auth: { settings: { devUserKey: "" }, authUser: null, authMode: "guest", authChecked: true, matchOwner: undefined, setBounty: () => undefined } as never,
    decks: { decks: [SELECTED, PLAYED], selectedDeck: SELECTED } as never,
    sheet: {} as never,
    friends: { state: null, refresh: () => undefined } as never,
    friendsEnabled: false,
    watch: { roomId: null, seat: 0 },
    joinRoomId,
    onModeStarted: () => undefined,
  });
  return null;
}

async function mount(joinRoomId: string | null, state: unknown = null) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={[{ pathname: "/", state }]}>
        <Harness joinRoomId={joinRoomId} />
      </MemoryRouter>,
    );
  });
}

describe("opening a /join link (#1507)", () => {
  it("sits down in that room with the selected deck (#1507)", async () => {
    h.connect.mockResolvedValue(undefined);
    await mount("ROOM1");
    expect(h.launches).toHaveLength(1);
    expect(h.launches[0]).toMatchObject({ deckId: "selected", invite: false });
    await h.tasks[0]!(1);
    expect(h.connect).toHaveBeenCalledWith(expect.objectContaining({ roomId: "ROOM1", deck: { leaderId: "OP01-001", deck: ["A", "B"] } }), 1);
  });

  it("does not seat the host in their own room and offers the link instead (#1507)", async () => {
    rememberOwnRoom("ROOM1");
    await mount("ROOM1");
    expect(h.launches).toHaveLength(0);
    expect(current!.ownRoomLink).toBe(`${window.location.origin}/join/ROOM1`);
  });

  it("says the room is closed or full and keeps the room id for the join sheet (#1507)", async () => {
    h.connect.mockRejectedValue(new Error("seat taken"));
    await mount("ROOM1");
    await expect(h.tasks[0]!(1)).rejects.toThrow(JOIN_FAILED_MESSAGE);
    expect(takeJoinFallback()).toBe("ROOM1");
  });

  it("passes a cancelled launch through untouched (#1507)", async () => {
    h.connect.mockRejectedValue(new LaunchCancelledError());
    await mount("ROOM1");
    await expect(h.tasks[0]!(1)).rejects.toBeInstanceOf(LaunchCancelledError);
    expect(takeJoinFallback()).toBeNull();
  });

  it("gives up on a join that never answers and drops the connection attempt (#1507)", async () => {
    vi.useFakeTimers();
    h.connect.mockReturnValue(new Promise(() => undefined));
    await mount("ROOM1");
    const done = h.tasks[0]!(1).catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(JOIN_TIMEOUT_MS + 1);
    expect(((await done) as Error).message).toBe(JOIN_FAILED_MESSAGE);
    expect(h.disconnect).toHaveBeenCalled();
    expect(takeJoinFallback()).toBe("ROOM1");
  });

  it("leaves a match that is still running alone and hands the room to the join sheet (#1507)", async () => {
    saveMatchResume({ mode: "duel", serverUrl: "ws://x", roomId: "LIVE", reconnectionToken: "t", seat: 0, savedAt: Date.now() });
    await mount("ROOM1");
    expect(h.launches).toHaveLength(0);
    expect(takeJoinFallback()).toBe("ROOM1");
  });
});

describe("Invite someone else lands in the lobby (#1507)", () => {
  it("opens the room with the deck that was played, not the current selection (#1507)", async () => {
    h.connect.mockResolvedValue(undefined);
    await mount(null, { openInviteRoom: { deckId: "played" } });
    expect(h.launches).toHaveLength(1);
    expect(h.launches[0]).toMatchObject({ deckId: "played", invite: true, inviteLink: true });
    await h.tasks[0]!(1);
    expect(h.connect).toHaveBeenCalledWith(
      expect.objectContaining({ preferredSeat: 0, deck: { leaderId: "ST01-001", deck: ["A", "B"] } }),
      1,
    );
  });

  it("falls back to the selected deck when the played one is unknown or gone (#1507)", () => {
    expect(pickInviteDeck([SELECTED, PLAYED], "gone", SELECTED)).toBe(SELECTED);
    expect(pickInviteDeck([SELECTED, PLAYED], null, SELECTED)).toBe(SELECTED);
    expect(pickInviteDeck([SELECTED, PLAYED], "played", SELECTED)).toBe(PLAYED);
  });
});
