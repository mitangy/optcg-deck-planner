// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import leadersFixture from "../decks/metaLeaders.fixture.json";
import decksFixture from "../decks/metaDecks.fixture.json";
import { deckSignature, metaDeckCardIds, type MetaDeck, type MetaLeader } from "../decks/meta";
import { getSelectedDeckId, listSavedDecks } from "../decks/storage";
import type { MetaSnapshot } from "../leaders/snapshot";
import { SnapshotContext } from "../leaders/useMetaView";
import { LeaderPage } from "./LeaderPage";

const leaders = leadersFixture.leaders.slice(0, 3) as MetaLeader[];
const decks = decksFixture.decks.slice(0, 3) as MetaDeck[];
const SNAPSHOT: MetaSnapshot = {
  version: 1,
  generatedAt: "2026-11-03T05:00:00.000Z",
  days: 30,
  events: leadersFixture.events,
  total_decks: leadersFixture.total_decks,
  source: leadersFixture.source,
  source_url: leadersFixture.source_url,
  leaders,
  decks: { "OP17-039": decks },
};

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});

beforeEach(() => {
  localStorage.clear();
  // The live API is unreachable here: the page must keep working from the snapshot.
  vi.stubGlobal("fetch", () => Promise.resolve(new Response("{}", { status: 503 })));
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  document.head.innerHTML = "";
});

function Where() {
  const loc = useLocation();
  return <output data-testid="where">{loc.pathname}</output>;
}

async function mount(path: string) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <SnapshotContext.Provider value={SNAPSHOT}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/leaders/:slug" element={<LeaderPage />} />
            <Route path="*" element={<p>elsewhere</p>} />
          </Routes>
          <Where />
        </MemoryRouter>
      </SnapshotContext.Provider>,
    );
  });
}

const where = () => host!.querySelector('[data-testid="where"]')!.textContent;
const playButtons = () => [...host!.querySelectorAll("button")].filter((b) => b.textContent === "Play this deck online");

describe("leader page (#914)", () => {
  it("the bare card id redirects to the canonical slug and shows the page (#914)", async () => {
    await mount("/leaders/op17-039");
    expect(where()).toBe("/leaders/op17-039-rocks-d-xebec");
    expect(host!.querySelector("h1")?.textContent).toBe("Rocks.D.Xebec (OP17-039) deck list – play online free");
    expect(document.title).toContain("Rocks.D.Xebec (OP17-039)");
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe("https://optcgduel.app/leaders/op17-039-rocks-d-xebec");
  });

  it("starts from the snapshot the server embedded in the page when nothing else provides one (#914)", async () => {
    const script = document.createElement("script");
    script.type = "application/json";
    script.id = "meta-snapshot";
    script.textContent = JSON.stringify(SNAPSHOT);
    document.body.appendChild(script);
    try {
      host = document.createElement("div");
      document.body.appendChild(host);
      root = createRoot(host);
      await act(async () => {
        root!.render(
          <MemoryRouter initialEntries={["/leaders/op17-039-rocks-d-xebec"]}>
            <Routes>
              <Route path="/leaders/:slug" element={<LeaderPage />} />
            </Routes>
          </MemoryRouter>,
        );
      });
      expect(host.querySelector("h1")?.textContent).toContain("Rocks.D.Xebec");
      expect(playButtons()).toHaveLength(1 + decks.length);
    } finally {
      script.remove();
    }
  });

  it("the top button plays the best list and each list's button plays that list, then opens the lobby (#914)", async () => {
    await mount("/leaders/op17-039-rocks-d-xebec");
    const buttons = playButtons();
    expect(buttons).toHaveLength(1 + decks.length);
    await act(async () => buttons[0].click());
    expect(where()).toBe("/");
    expect(listSavedDecks()).toHaveLength(1);
    const first = listSavedDecks()[0];
    expect(deckSignature(first.leaderId, first.cards)).toBe(deckSignature("OP17-039", metaDeckCardIds(decks[0])));
    expect(getSelectedDeckId()).toBe(first.id);

    act(() => root?.unmount());
    host?.remove();
    await mount("/leaders/op17-039-rocks-d-xebec");
    await act(async () => playButtons()[3].click());
    const chosen = listSavedDecks().find((d) => d.id === getSelectedDeckId())!;
    expect(deckSignature(chosen.leaderId, chosen.cards)).toBe(deckSignature("OP17-039", metaDeckCardIds(decks[2])));
  });

  it("a leader with no data says so and is kept out of search results (#914)", async () => {
    await mount("/leaders/op99-001-nobody");
    await act(async () => undefined);
    expect(host!.querySelector("h1")?.textContent).toContain("no recent tournament data");
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex");
  });
});
