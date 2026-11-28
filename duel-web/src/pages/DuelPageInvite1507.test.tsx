// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const shared = vi.hoisted(() => ({
  session: {} as Record<string, unknown>,
  bump: () => {},
  hub: null as null | { deckId: string | null; hasPlannerDeck: boolean; onInvite: () => void },
}));

vi.mock("../state/DuelSession", () => ({
  useDuelSession: () => {
    const [, set] = useState(0);
    shared.bump = () => set((n) => n + 1);
    return shared.session;
  },
}));
vi.mock("../friends/FriendsPanel", () => ({
  useFriends: () => ({ state: null, refresh: () => undefined }),
  FriendInvites: () => null,
}));
vi.mock("../board/DuelBoard", () => ({
  DuelBoard: (props: { hub?: NonNullable<typeof shared.hub> }) => {
    shared.hub = props.hub ?? null;
    return <button type="button" onClick={() => props.hub?.onInvite()}>invite</button>;
  },
}));

import { isOwnRoom } from "../net/joinLinks";
import { DuelPage } from "./DuelPage";

let root: Root | null = null;
let host: HTMLElement | null = null;
let homeState: unknown = "never-went-home";

function Home() {
  homeState = useLocation().state;
  return <p>lobby</p>;
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

function seedDecks() {
  const deck = (id: string, plannerDeckId?: number) => ({ id, name: id, leaderId: "ST01-001", cards: [], updatedAt: 1, plannerDeckId });
  localStorage.setItem("optcg.duel.savedDecks.v1", JSON.stringify([deck("played", 5), deck("other")]));
  localStorage.setItem("optcg.duel.selectedDeckId.v1", "other");
}

beforeEach(() => {
  localStorage.clear();
  homeState = "never-went-home";
  shared.hub = null;
  seedDecks();
  const s: Record<string, unknown> = {
    launch: { status: "", leaderId: "ST01-001", deckId: "played", invite: false },
    launching: false,
    connected: true,
    view: { turnNumber: 3 },
    matchId: "room-1",
    seat: 0,
    role: "player",
    canReconnect: true,
    leave: vi.fn(async () => {
      Object.assign(s, { connected: false, view: null, matchId: null, canReconnect: false, launch: null });
      shared.bump();
    }),
    awayUntil: [null, null],
    clearError: () => undefined,
  };
  shared.session = s;
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

async function mount() {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={["/duel"]}>
        <Routes>
          <Route path="/duel" element={<DuelPage />} />
          <Route path="/" element={<Home />} />
        </Routes>
      </MemoryRouter>,
    );
  });
}

describe("Invite someone else from the match over hub (#1507)", () => {
  it("reaches the lobby with the invite handoff instead of being sent home without it (#1507)", async () => {
    await mount();
    await act(async () => host!.querySelector("button")!.click());
    expect(homeState).toEqual({ openInviteRoom: { deckId: "played" } });
  });

  it("offers the deck the match was played with, not the one selected now (#1507)", async () => {
    await mount();
    expect(shared.hub?.deckId).toBe("played");
    expect(shared.hub?.hasPlannerDeck).toBe(true);
  });

  it("has no price to show for a deck without a planner twin, and none for an unknown deck (#1507)", async () => {
    (shared.session.launch as { deckId: string | null }).deckId = "other";
    await mount();
    expect(shared.hub?.hasPlannerDeck).toBe(false);
    act(() => root?.unmount());
    (shared.session.launch as { deckId: string | null }).deckId = null;
    await mount();
    expect(shared.hub?.deckId).toBeNull();
    expect(shared.hub?.hasPlannerDeck).toBe(false);
  });

  it("remembers the room this browser opened, so its own join link is not auto-joined (#1507)", async () => {
    Object.assign(shared.session, { launch: { status: "", leaderId: "ST01-001", deckId: "played", invite: true } });
    await mount();
    expect(isOwnRoom("room-1")).toBe(true);
  });

  it("does not mark a room it only joined as its own (#1507)", async () => {
    await mount();
    expect(isOwnRoom("room-1")).toBe(false);
  });
});
