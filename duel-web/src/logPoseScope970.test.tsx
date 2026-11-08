// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { LogPoseGame, LogPosePage } from "@optcg/analyst-client";

const registered = vi.hoisted(() => ({
  pages: [] as (LogPosePage | null)[],
  games: [] as (LogPoseGame | null)[],
  // One object for every call, as the real provider's value is: hooks list its functions as effect dependencies.
  lp: {
    enabled: true,
    apiBase: "",
    session: { current: () => null, refresh: async () => ({ enabled: false }), getAuth: async () => null },
    openPanel: () => {},
    closePanel: () => {},
    panelOpen: false,
    available: true,
    openLogPose: () => true,
    askGame: async () => ({}),
    stopGameAsk: () => {},
  },
}));
vi.mock("@optcg/analyst-client", async (orig) => {
  const real = await orig<typeof import("@optcg/analyst-client")>();
  return {
    ...real,
    // The panel itself is not under test: record what each page tells it, and say chat is on.
    useLogPosePage: (page: LogPosePage | null) => void registered.pages.push(page),
    useLogPoseGame: (game: LogPoseGame | null) => void registered.games.push(game),
    useLogPoseDeckEditor: () => {},
    useLogPose: () => registered.lp,
  };
});
vi.mock("./history/historyApi", async (orig) => ({ ...(await orig<typeof import("./history/historyApi")>()), fetchMatchDetail: vi.fn(), fetchMatchHistory: vi.fn() }));

import { useLogPoseCopilot } from "./board/copilot/LogPoseCopilot";
import { useMatchBrief } from "./board/match/MatchBrief";
import { saveDeck } from "./decks/storage";
import { fetchMatchDetail, fetchMatchHistory, type MatchHistoryEntry } from "./history/historyApi";
import { liveMatchScope, matchLogScope, deckEditorScope } from "./logPoseScopes";
import { DeckConfigurePage } from "./pages/DeckConfigurePage";
import { HistoryPage } from "./pages/HistoryPage";
import { MatchLogPage } from "./pages/MatchLogPage";
import { LogPoseReview } from "./history/LogPoseReview";
import { lookupCard } from "./cards/atlas";

let root: Root | null = null;
let host: HTMLElement | null = null;
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
beforeEach(() => {
  registered.pages.length = 0;
  registered.games.length = 0;
  localStorage.clear();
  vi.stubGlobal("fetch", () => Promise.resolve(new Response("{}", { status: 404 })));
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = host = null;
  vi.unstubAllGlobals();
});

const name = (id: string) => lookupCard(id).name || id;
const last = <T,>(xs: T[]) => xs[xs.length - 1];
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 20))));
async function mount(path: string, route: string, el: React.ReactElement) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={route} element={el} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  await settle();
}

/** A game server ticket: header.payload.signature, the payload carrying the match id as `mid`. */
const ticket = (mid: string) => `h.${btoa(JSON.stringify({ mid })).replace(/=+$/, "")}.s`;
const entry = (o: Partial<MatchHistoryEntry> = {}): MatchHistoryEntry => ({
  match_id: "m_1", created_at: "2026-11-04T10:00:00Z", ranked: false, your_seat: 0, won: true, reason: "concede", turns: 5,
  your_leader_id: "ST01-001", opponent_leader_id: "OP01-001", opponent_name: "Zoro", rating_before: 0, rating_after: 0, has_replay: false, finished: true, ...o,
});

describe("the chat each duel-web page opens (#970)", () => {
  it("opens a match's chat on its history page, named by the two leaders (#970)", async () => {
    vi.mocked(fetchMatchDetail).mockResolvedValue({ match: entry({ match_id: "m_77" }), log: null });
    await mount("/history/m_77", "/history/:matchId", <MatchLogPage />);
    expect(last(registered.pages)?.scope).toEqual({ key: "match:m_77", title: `${name("ST01-001")} vs ${name("OP01-001")}` });
    expect(last(registered.pages)?.page).toBe("match-log");
  });

  it("opens a duel deck's own chat on its deck page (#970)", async () => {
    const deck = saveDeck({ id: "d-1", name: "Zoro Aggro", leaderId: "ST01-001", cards: [] });
    await mount(`/decks/${deck.id}/configure`, "/decks/:deckId/configure", <DeckConfigurePage />);
    expect(last(registered.pages)?.scope).toEqual({ key: "deck:duel:d-1", title: "Zoro Aggro" });
  });

  it("opens the planner deck's chat on a duel deck linked to a planner deck, so both apps share one (#970)", async () => {
    const deck = saveDeck({ id: "d-2", name: "Shared", leaderId: "ST01-001", cards: [], plannerDeckId: 42 });
    await mount(`/decks/${deck.id}/configure`, "/decks/:deckId/configure", <DeckConfigurePage />);
    expect(last(registered.pages)?.scope).toEqual({ key: "deck:planner:42", title: "Shared" });
  });

  it("gives an unsaved deck no scope of its own, so it uses the general chat (#970)", () => {
    expect(deckEditorScope({ id: "bad id!", name: "x" })).toBeUndefined();
    expect(deckEditorScope({ id: "d-3", name: "  " })).toEqual({ key: "deck:duel:d-3", title: "This deck" });
  });

  it("keys a live game by the match id in its ticket, the id the history page uses (#970)", () => {
    expect(liveMatchScope(ticket("m_77"), "Luffy", "Zoro")).toEqual({ key: "match:m_77", title: "Luffy vs Zoro" });
    expect(matchLogScope("m_77", "Luffy", "Zoro")?.key).toBe("match:m_77");
    // A ticket that can't be read has no match id, so the board falls back to the general chat.
    expect(liveMatchScope("not-a-ticket.with.dots!", "Luffy", "Zoro")).toBeUndefined();
  });

  const source = { brief: { ticket: ticket("m_88"), leaderId: "ST01-001", opponentId: "OP01-001", deck: [] }, ranked: false };

  it("opens the match's chat from the matchup brief and the copilot on the board (#970)", () => {
    function Board() {
      useMatchBrief({ source, role: "player", roomMatchId: "m_88", phase: "main", over: false, layout: "desktop" });
      useLogPoseCopilot({ source, role: "player", view: null, battleLog: [], onSendIntent: () => {}, over: false, layout: "desktop", ticketSeat: 0 });
      return null;
    }
    renderToStaticMarkup(<Board />);
    const want = { key: "match:m_88", title: `${name("ST01-001")} vs ${name("OP01-001")}` };
    expect(last(registered.pages)?.scope).toEqual(want);
    expect(last(registered.games)?.scope).toEqual(want);
  });
});

describe("Chat about this game (#970)", () => {
  it("opens the Log Pose panel on the match's chat from the review (#970)", async () => {
    const open = vi.spyOn(registered.lp, "openLogPose");
    await mount("/history/m_1", "/history/:matchId", <LogPoseReview matchId="m_1" finished />);
    const btn = [...host!.querySelectorAll("button")].find((b) => b.textContent === "Chat about this game")!;
    expect(btn.disabled).toBe(false);
    await act(async () => btn.click());
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith();
    open.mockRestore();
  });
});

describe("the match history list marks games that have a Log Pose chat (#970)", () => {
  it("shows a compass on a row whose game has a chat and on no other (#970)", async () => {
    vi.mocked(fetchMatchHistory).mockResolvedValue([entry({ match_id: "m_1", has_chat: true }), entry({ match_id: "m_2", has_chat: false }), entry({ match_id: "m_3" })]);
    await mount("/history", "/history", <HistoryPage />);
    const rows = [...host!.querySelectorAll(".history-item")];
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.querySelector('[aria-label="Has a Log Pose chat"]') !== null)).toEqual([true, false, false]);
  });
});
