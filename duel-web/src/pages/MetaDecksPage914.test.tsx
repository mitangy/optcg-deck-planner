// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import leadersFixture from "../decks/metaLeaders.fixture.json";
import type { MetaLeader } from "../decks/meta";
import type { MetaSnapshot } from "../leaders/snapshot";
import { SnapshotContext } from "../leaders/useMetaView";
import { MetaDecksPage } from "./MetaDecksPage";

const leaders = leadersFixture.leaders.slice(0, 3) as MetaLeader[];
const SNAPSHOT: MetaSnapshot = {
  version: 1,
  generatedAt: "2026-11-03T05:00:00.000Z",
  days: 30,
  events: leadersFixture.events,
  total_decks: leadersFixture.total_decks,
  source: leadersFixture.source,
  source_url: leadersFixture.source_url,
  leaders,
  decks: {},
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

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

async function mount(fetchImpl: () => Promise<Response>) {
  vi.stubGlobal("fetch", fetchImpl);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <SnapshotContext.Provider value={SNAPSHOT}>
        <MemoryRouter>
          <MetaDecksPage />
        </MemoryRouter>
      </SnapshotContext.Provider>,
    );
  });
}

describe("meta decks page starts from the snapshot (#914)", () => {
  it("shows the snapshot's leaders at once and keeps them when the live meta cannot be loaded (#914)", async () => {
    await mount(() => Promise.resolve(new Response("{}", { status: 503 })));
    const names = [...host!.querySelectorAll(".meta-leader-name")].map((n) => n.textContent);
    expect(names).toEqual(leaders.map((l) => l.name));
    expect(host!.textContent).not.toContain("Couldn't load the meta");
  });

  it("swaps in the live leaders when they arrive (#914)", async () => {
    const live = { ...leadersFixture, leaders: leadersFixture.leaders.slice(3, 5) };
    await mount(() => Promise.resolve(new Response(JSON.stringify(live), { status: 200 })));
    const names = [...host!.querySelectorAll(".meta-leader-name")].map((n) => n.textContent);
    expect(names).toEqual(live.leaders.map((l) => l.name));
  });
});
