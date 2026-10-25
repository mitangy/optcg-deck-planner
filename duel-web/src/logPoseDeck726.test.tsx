// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { deckListText, parseDraft } from "@optcg/analyst-client";
import { validateImportedList } from "./decks/storage";
import { DRAFT_STATE_KEY, openDeckFor, openNewDeckFor, readLogPoseDraft } from "./logPose";
import { LeaveGameDialog } from "./LeaveGameDialog";
import { NewDeckPage } from "./pages/NewDeckPage";

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  vi.stubGlobal("fetch", () => Promise.resolve(new Response("{}", { status: 404 })));
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const DRAFT = { name: "Red Luffy", list: "1xST01-001\n4xST01-003\n4xST01-006" };

describe("Log Pose opens the create-deck page (#726)", () => {
  it("never opens by itself over a board, a watched game or a replay (#726)", () => {
    for (const path of ["/duel", "/hotseat", "/watch/abc123", "/replay/m1", "/demo"]) {
      const navigate = vi.fn();
      const ask = vi.fn();
      expect(openNewDeckFor(navigate, () => path, ask)(DRAFT, { auto: true }), path).toBe(false);
      expect(navigate, path).not.toHaveBeenCalled();
      expect(ask, path).not.toHaveBeenCalled();
    }
  });

  it("asks before the button takes the player off a game page, and goes only on Leave (#728)", () => {
    for (const path of ["/duel", "/hotseat", "/watch/abc123", "/replay/m1", "/demo"]) {
      const navigate = vi.fn();
      const ask = vi.fn();
      expect(openNewDeckFor(navigate, () => path, ask)(DRAFT, { auto: false }), path).toBe(true);
      expect(navigate, path).not.toHaveBeenCalled();
      expect(ask, path).toHaveBeenCalledTimes(1);
      ask.mock.calls[0]![0]();
      expect(navigate, path).toHaveBeenCalledWith("/decks/new", { state: { [DRAFT_STATE_KEY]: DRAFT } });
    }
  });

  it("goes straight away from pages that are not a game (#728)", () => {
    for (const path of ["/", "/decks", "/settings", "/history/m1"]) {
      const navigate = vi.fn();
      const ask = vi.fn();
      openNewDeckFor(navigate, () => path, ask)(DRAFT, { auto: false });
      expect(ask, path).not.toHaveBeenCalled();
      expect(navigate, path).toHaveBeenCalledTimes(1);
    }
  });

  it("opens by itself from the lobby, decks and deck editor pages (#726)", () => {
    for (const path of ["/", "/decks", "/decks/d1/configure", "/history"]) {
      const navigate = vi.fn();
      expect(openNewDeckFor(navigate, () => path, vi.fn())(DRAFT, { auto: true }), path).toBe(true);
      expect(navigate, path).toHaveBeenCalledWith("/decks/new", { state: { [DRAFT_STATE_KEY]: DRAFT } });
    }
  });

  it("opens a saved deck's editor inside the app, and refuses a deck that isn't one of ours (#726)", () => {
    const navigate = vi.fn();
    const open = openDeckFor(navigate);
    expect(open("duel:d 1")).toBe(true);
    expect(navigate).toHaveBeenCalledWith("/decks/d%201/configure");
    navigate.mockClear();
    expect(open("planner:7")).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("reads the filled-in deck from router state and nothing else (#726)", () => {
    expect(readLogPoseDraft({ [DRAFT_STATE_KEY]: DRAFT })).toEqual(DRAFT);
    expect(readLogPoseDraft({ [DRAFT_STATE_KEY]: { name: "x", list: "  " } })).toBeNull();
    expect(readLogPoseDraft({ [DRAFT_STATE_KEY]: { name: 1, list: "1xST01-001" } })).toBeNull();
    expect(readLogPoseDraft(null)).toBeNull();
  });

  it("writes a list this app's importer accepts, with the leader and every card's copies (#726)", () => {
    const draft = parseDraft({
      id: "d1",
      leader_id: "ST01-001",
      name: "Red",
      cards: [
        { id: "ST01-003", name: "a", copies: 4 },
        { id: "ST01-006", name: "b", copies: 4 },
        { id: "ST01-014", name: "c", copies: 2 },
      ],
    })!;
    const v = validateImportedList(deckListText(draft));
    expect(v.ok).toBe(true);
    expect(v.leaderId).toBe("ST01-001");
    expect(v.cards).toHaveLength(10);
  });
});

function Where() {
  const l = useLocation();
  return <output id="where">{`${l.pathname}|${l.state === null ? "none" : "state"}`}</output>;
}

function HandOver() {
  const navigate = useNavigate();
  return <button id="again" onClick={() => navigate("/decks/new", { state: { [DRAFT_STATE_KEY]: { name: "Second", list: "1xST01-001\n4xST01-003" } } })} />;
}

async function renderPage(state: unknown) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <MemoryRouter initialEntries={[{ pathname: "/decks/new", state }]}>
        <Where />
        <HandOver />
        <Routes>
          <Route path="/decks/new" element={<NewDeckPage />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
}

describe("NewDeckPage filled in by Log Pose (#726)", () => {
  it("shows Log Pose's name and list with a note, and forgets the router state so a refresh does not refill it (#726)", async () => {
    await renderPage({ [DRAFT_STATE_KEY]: DRAFT });
    expect((host!.querySelector("#new-deck-name") as HTMLInputElement).value).toBe("Red Luffy");
    expect((host!.querySelector("#deck-import-text") as HTMLTextAreaElement).value).toBe(DRAFT.list);
    expect(host!.textContent).toContain("Filled in by Log Pose");
    expect(host!.querySelector("#where")!.textContent).toBe("/decks/new|none");
  });

  it("fills in a second deck handed over while the page is already open (#726)", async () => {
    await renderPage({ [DRAFT_STATE_KEY]: DRAFT });
    await act(async () => (host!.querySelector("#again") as HTMLButtonElement).click());
    expect((host!.querySelector("#new-deck-name") as HTMLInputElement).value).toBe("Second");
    expect((host!.querySelector("#deck-import-text") as HTMLTextAreaElement).value).toBe("1xST01-001\n4xST01-003");
    expect(host!.querySelector("#where")!.textContent).toBe("/decks/new|none");
  });

  it("is blank, with no note, when nothing was handed over (#726)", async () => {
    await renderPage(null);
    expect((host!.querySelector("#new-deck-name") as HTMLInputElement).value).toBe("");
    expect((host!.querySelector("#deck-import-text") as HTMLTextAreaElement).value).toBe("");
    expect(host!.textContent).not.toContain("Filled in by Log Pose");
  });
});

describe("LeaveGameDialog (#728)", () => {
  it("offers Leave and Stay, and Esc stays (#728)", async () => {
    const onLeave = vi.fn();
    const onStay = vi.fn();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root!.render(<LeaveGameDialog open onLeave={onLeave} onStay={onStay} />));
    const btn = (n: string) => [...document.querySelectorAll("button")].find((b) => b.textContent === n)!;
    expect(document.body.textContent).toContain("Leave this game to open the deck builder?");
    await act(async () => {
      document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onStay).toHaveBeenCalledTimes(1);
    expect(onLeave).not.toHaveBeenCalled();
    await act(async () => btn("Stay").click());
    expect(onStay).toHaveBeenCalledTimes(2);
    expect(onLeave).not.toHaveBeenCalled();
    await act(async () => btn("Leave").click());
    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});
