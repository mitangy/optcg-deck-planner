// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TournamentsCard } from "./TournamentsCard";
import type { TournamentSummary } from "./tournamentApi";

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.unstubAllGlobals();
});

const summary = (over: Partial<TournamentSummary>): TournamentSummary => ({
  id: 1, code: "abc", name: "Friday bracket", format: "single_elim", size: 8, status: "running",
  players_joined: 8, my_role: "joined", my_match_ready: false, ...over,
});

async function mount(tournaments: TournamentSummary[], signedIn = true): Promise<HTMLElement> {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ tournaments }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <MemoryRouter>
        <TournamentsCard signedIn={signedIn} />
      </MemoryRouter>,
    );
  });
  return host;
}

describe("Tournaments card on the lobby (#997)", () => {
  it("flags a running tournament whose match is ready for you and links to it (#997)", async () => {
    const el = await mount([summary({ my_match_ready: true }), summary({ id: 2, code: "def", name: "Other", my_match_ready: false })]);
    expect(el.textContent).toContain("Your match is ready");
    expect(el.textContent).toContain("1 ready");
    expect(el.textContent?.match(/Your match is ready/g)).toHaveLength(1);
    expect(el.querySelector('a[href="/tournaments/abc"]')).not.toBeNull();
  });

  it("lists only open and running tournaments, not finished ones (#997)", async () => {
    const el = await mount([summary({ name: "Done one", status: "finished" }), summary({ id: 2, code: "def", name: "Live one", status: "open" })]);
    expect(el.textContent).toContain("Live one");
    expect(el.textContent).not.toContain("Done one");
  });

  it("shows nothing and loads nothing when signed out (#997)", async () => {
    const el = await mount([summary({})], false);
    expect(el.innerHTML).toBe("");
    expect(fetch).not.toHaveBeenCalled();
  });
});
