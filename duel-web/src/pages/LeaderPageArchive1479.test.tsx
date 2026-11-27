// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import leadersFixture from "../decks/metaLeaders.fixture.json";
import decksFixture from "../decks/metaDecks.fixture.json";
import type { MetaDeck, MetaLeader } from "../decks/meta";
import type { MetaSnapshot } from "../leaders/snapshot";
import { SnapshotContext } from "../leaders/useMetaView";
import { LeaderPage } from "./LeaderPage";

const leaders = leadersFixture.leaders.slice(0, 3) as MetaLeader[];
// leaders[1] is the archived one: it is not in the current list
const decks = decksFixture.decks.slice(0, 3) as MetaDeck[];
const SNAPSHOT: MetaSnapshot = {
  version: 1,
  generatedAt: "2026-11-03T05:00:00.000Z",
  days: 30,
  events: leadersFixture.events,
  total_decks: leadersFixture.total_decks,
  source: leadersFixture.source,
  source_url: leadersFixture.source_url,
  leaders: [leaders[0], leaders[2]],
  decks: { "OP17-039": decks, "ST30-001": decks },
  archived: [{ leader: leaders[1], lastSeen: "2026-10-15" }],
  archiveDays: 180,
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
  vi.stubGlobal("fetch", () => Promise.resolve(new Response("{}", { status: 503 })));
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  document.head.innerHTML = "";
});

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
        </MemoryRouter>
      </SnapshotContext.Provider>,
    );
  });
}

const where = () => host!.querySelector('[data-testid="where"]')!.textContent;
const playButtons = () => [...host!.querySelectorAll("button")].filter((b) => b.textContent === "Play this deck online");

const robots = () => document.head.querySelector('meta[name="robots"]')?.getAttribute("content") ?? "";

describe("archived leader page at runtime (#1479)", () => {
  it("shows when the leader was last seen, is indexable, and says the lists cover the long window (#1479)", async () => {
    await mount("/leaders/st30-001-luffy-ace");
    await act(async () => undefined);
    expect(host!.querySelector("h1")?.textContent).toContain("ST30-001");
    expect(host!.querySelector(".leader-archive-note")?.textContent).toContain("Last seen in the meta on Oct 15, 2026.");
    expect(host!.textContent).toContain("last 180 days");
    expect(robots()).not.toContain("noindex");
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toContain("last seen in the meta on Oct 15, 2026");
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe("https://optcgduel.app/leaders/st30-001-luffy-ace");
    expect(host!.querySelectorAll(".meta-deck").length).toBe(decks.length);
  });

  it("a leader in neither list still gets the no-data page and noindex (#1479)", async () => {
    await mount("/leaders/op99-001-nobody");
    await act(async () => undefined);
    expect(host!.querySelector("h1")?.textContent).toContain("no recent tournament data");
    expect(robots()).toBe("noindex");
  });

  it("a current leader shows no last-seen note (#1479)", async () => {
    await mount("/leaders/op17-039-rocks-d-xebec");
    await act(async () => undefined);
    expect(host!.querySelector(".leader-archive-note")).toBeNull();
  });
});

describe("an archived leader that is current again (#1479)", () => {
  it("drops the last-seen note and the archive entry once the live list has it (#1479)", async () => {
    vi.stubGlobal("fetch", (url: string) =>
      Promise.resolve(
        String(url).includes("/meta/leaders")
          ? new Response(JSON.stringify({ ...leadersFixture, leaders }), { status: 200, headers: { "content-type": "application/json" } })
          : new Response("{}", { status: 503 }),
      ),
    );
    await mount("/leaders/st30-001-luffy-ace");
    await act(async () => undefined);
    expect(host!.querySelector("h1")?.textContent).toContain("ST30-001");
    expect(host!.querySelector(".leader-archive-note")).toBeNull();
  });
});
