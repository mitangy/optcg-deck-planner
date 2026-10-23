// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { AdminDayMatches, AdminOverview } from "./adminApi";
import { PlayersTab } from "./PlayersTab";

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

const days = ["2026-10-20", "2026-10-21", "2026-10-22"];
const leaders = Array.from({ length: 12 }, (_, i) => ({ leader_id: `OP01-${String(i + 1).padStart(3, "0")}`, games: 100 - i * 7, wins: 50 - i }));
const overview = {
  generated_at: "2026-10-22T12:00:00Z",
  days: 7,
  accounts: { total: 3, real: 2, guests: 1, staff: 1, banned: 0, new_7d: 1, new_30d: 2 },
  signups_by_day: days.map((day) => ({ day, real: 1, guests: 0 })),
  active: { d1: 1, d7: 2, d30: 3, real_d7: 2, real_d30: 2 },
  matches_by_day: days.map((day, i) => ({ day, ranked: i, casual: 1 })),
  matches: { total: 9, last_7d: 5, ranked_7d: 3, avg_turns_30d: 7 },
  top_leaders: leaders,
  top_leaders_30d: leaders,
  planner: { decks: 1, users_with_decks: 1 },
  log_pose: { questions_month: 1, spend_month_usd: 0.5, users_with_access: 1 },
} as AdminOverview;

const dayMatches: AdminDayMatches = {
  day: "2026-10-21",
  matches: [
    {
      id: "m-abc", created_at: "2026-10-21T14:05:00+00:00", ranked: false, turns: 9, winner_seat: 1,
      seats: [
        { user_id: 1, name: "annie", leader_id: "OP01-001", won: false },
        { user_id: 2, name: null, leader_id: null, won: true },
      ],
    },
  ],
};

function mount(loadMatches: (day: string) => Promise<AdminDayMatches>): HTMLElement {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <MemoryRouter>
        <PlayersTab data={overview} days={7} onDaysChange={() => {}} loadMatches={loadMatches} />
      </MemoryRouter>,
    );
  });
  return host;
}

const click = (el: Element) => act(() => (el as HTMLElement).click());

describe("PlayersTab drill-down and leaders table (#691)", () => {
  it("opens that day's matches when a day on the matches chart is clicked, with a replay link and a close button (#691)", async () => {
    const load = vi.fn().mockResolvedValue(dayMatches);
    const el = mount(load);
    expect(el.querySelector(".adm-daymatches")).toBeNull();
    await act(async () => {
      (el.querySelector('section[aria-label="Matches per day"] .adm-bar-hit[data-day="2026-10-21"]') as HTMLElement).click();
    });
    expect(load).toHaveBeenCalledExactlyOnceWith("2026-10-21");
    const panel = el.querySelector(".adm-daymatches")!;
    expect(panel.textContent).toContain("Matches on Wed, Oct 21");
    expect(panel.textContent).toContain("Casual");
    expect(panel.textContent).toContain("annie");
    expect(panel.textContent).toContain("Unknown leader");
    expect(panel.textContent).toContain("Unknown player");
    // Seat 1 won: only its side says so.
    expect(panel.querySelector('.adm-match-seat[data-seat="1"] .adm-match-win')).not.toBeNull();
    expect(panel.querySelector('.adm-match-seat[data-seat="0"] .adm-match-win')).toBeNull();
    expect(panel.querySelector("a.adm-match-link")!.getAttribute("href")).toBe("/replay/m-abc");
    click(panel.querySelector("button[aria-label^='Close']")!);
    expect(el.querySelector(".adm-daymatches")).toBeNull();
  });

  it("does not drill down from the signups chart (#691)", () => {
    const load = vi.fn().mockResolvedValue(dayMatches);
    const el = mount(load);
    click(el.querySelector('section[aria-label="Signups per day"] .adm-bar-hit[data-day="2026-10-21"]')!);
    expect(load).not.toHaveBeenCalled();
    expect(el.querySelector(".adm-daymatches")).toBeNull();
  });

  it("lists ten leaders by games, sorts on a header click with aria-sort, and shows all on request (#691)", () => {
    const el = mount(vi.fn());
    const rows = () => el.querySelectorAll(".adm-leaders-table tbody tr");
    const gamesCol = () => [...el.querySelectorAll(".adm-leaders-table tbody tr td:nth-child(2) .adm-leader-num")].map((c) => Number(c.textContent));
    expect(rows().length).toBe(10);
    expect(gamesCol()[0]).toBe(100);
    const th = (name: string) => [...el.querySelectorAll<HTMLElement>(".adm-leaders-table th")].find((h) => h.textContent!.startsWith(name))!;
    expect(th("Games").getAttribute("aria-sort")).toBe("descending");
    click(th("Games").querySelector("button")!);
    expect(th("Games").getAttribute("aria-sort")).toBe("ascending");
    expect(th("Leader").getAttribute("aria-sort")).toBe("none");
    // Ascending over all twelve, but only ten are shown: the ten smallest.
    expect(gamesCol()[0]).toBe(100 - 11 * 7);
    click([...el.querySelectorAll("button")].find((b) => b.textContent === "Show all 12")!);
    expect(rows().length).toBe(12);
  });
});
