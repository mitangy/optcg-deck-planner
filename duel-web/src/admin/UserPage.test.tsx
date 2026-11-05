// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { AdminUserDetail } from "./adminApi";

vi.mock("../net/api", () => ({ fetchAuthMe: vi.fn().mockResolvedValue({ id: 1, email: "a@example.com", name: "A" }) }));
vi.mock("../nav/NavMenu", () => ({ NavMenu: () => null }));
vi.mock("./adminApi", async (orig) => ({
  ...(await orig<typeof import("./adminApi")>()),
  fetchAdminMe: vi.fn().mockResolvedValue({ role: "admin", can: { analytics: true, set_roles: true, ban: true, delete: true } }),
  fetchAdminUser: vi.fn(),
}));

import { fetchAdminUser } from "./adminApi";
import UserPage from "./UserPage";

let root: Root | null = null;
let host: HTMLElement | null = null;
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const base = (mode: "ranked" | "bot", over: object) => ({
  created_at: "2026-11-04T22:30:00Z", mode, leader_id: "OP01-001", opponent_leader_id: "OP05-060", opponent: null, bot_level: null, won: true, turns: 9, reason: "lethal", ...over,
});
const detail = {
  user: { id: 2, email: "z@example.com", name: "Zoro", username: "Zoro", role: "user", created_at: "2026-09-14T10:00:00Z", banned_at: null, ban_reason: null, signup_source: null, matches: 1, last_match_at: null, games: { ranked: 1, friends: 0, private: 0, bot: 1, practice: 0 } },
  last_seen_at: null, last_seen: { lobby: null, match: null, solo: null, log_pose: null },
  online: { now: false, room_role: null, ranked: null }, rating: null,
  modes: [], solo_tracked_since: null, top_leaders: [],
  recent_matches: [
    base("ranked", { id: "m_ranked", opponent: { id: 77, name: "Nami" }, replay: true }),
    base("bot", { id: "s_bot", replay: false }),
  ],
  planner: { decks: 0, owned_cards: 0, owned_unique: 0 },
  duel: { saved_decks: 0, uploads: 0, uploads_taken_down: 0, friends: 0, friend_requests_pending: 0 },
  log_pose: { access: null, questions_total: 0, questions_month: 0, spend_total_usd: 0, spend_month_usd: 0, last_used_at: null, threads: 0 },
  moderation: { reports_against: 0, reports_open: 0, reports_filed: 0, warnings: 0, banned_by: null },
} as unknown as AdminUserDetail;

describe("admin user page (#988)", () => {
  it("links the opponent to their admin page and offers Replay only for games that have one (#988)", async () => {
    vi.mocked(fetchAdminUser).mockResolvedValue(detail);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={["/admin/users/2"]}>
          <Routes>
            <Route path="/admin/users/:id" element={<UserPage />} />
          </Routes>
        </MemoryRouter>,
      );
    });
    expect(fetchAdminUser).toHaveBeenCalledWith(2);
    const rows = host.querySelectorAll(".adm-um");
    expect(rows.length).toBe(2);
    expect(rows[0]!.querySelector("a.adm-ulink")!.getAttribute("href")).toBe("/admin/users/77");
    expect(rows[0]!.querySelector("a.adm-match-link")!.getAttribute("href")).toBe("/replay/m_ranked");
    expect(rows[1]!.querySelector("a")).toBeNull();
  });
});
