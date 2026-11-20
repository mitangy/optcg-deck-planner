// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { MatchHistoryEntry } from "./historyApi";
import { MatchHistoryList } from "./MatchHistoryList";

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
});

const match = (i: number): MatchHistoryEntry => ({
  match_id: `m${i}`,
  created_at: "2026-10-02T10:00:00+00:00",
  ranked: false,
  your_seat: 1,
  won: i % 2 === 0,
  reason: "concede",
  turns: 5,
  your_leader_id: null,
  opponent_leader_id: null,
  opponent_name: `Rival ${i}`,
  rating_before: 1000,
  rating_after: 1000,
  has_replay: false,
});

function render(matches: MatchHistoryEntry[], limit?: number) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<MemoryRouter><MatchHistoryList matches={matches} limit={limit} /></MemoryRouter>));
  return host.querySelectorAll("li.history-item");
}

describe("MatchHistoryList", () => {
  it("shows only the first N games when given a limit, and all of them without one (#1383)", () => {
    const all = Array.from({ length: 8 }, (_, i) => match(i));
    const limited = render(all, 3);
    expect(limited).toHaveLength(3);
    expect(limited[2].textContent).toContain("Rival 2");
    act(() => root!.unmount());
    host!.remove();
    expect(render(all)).toHaveLength(8);
  });
});
