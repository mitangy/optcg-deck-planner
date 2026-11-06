// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { AdminEvent, AdminEventSummary } from "./adminApi";

const api = vi.hoisted(() => ({
  fetchAdminEvents: vi.fn(),
  fetchAdminEvent: vi.fn(),
  createAdminEvent: vi.fn(),
  updateAdminEvent: vi.fn(),
  deleteAdminEvent: vi.fn(),
  commitEventSeed: vi.fn(),
  drawEvent: vi.fn(),
  forfeitEventWinner: vi.fn(),
  eventCsvUrl: (id: string) => `/csv/${id}`,
}));
vi.mock("./adminApi", () => api);
const { EventTab } = await import("./EventTab");

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
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const event = (over: Partial<AdminEvent> = {}): AdminEvent => ({
  id: "cup-2026-12", title: "Friday Cup", description: "", starts_at: "2026-12-04T17:00:00Z", ends_at: "2026-12-04T21:00:00Z", status: "upcoming",
  format: "single_elim", bracket_size: 8, best_of: 3, prize: "Booster box", prize_details: "", prize_method: "placement", winners: 3, min_games: 3, min_opponents: 2, min_turns: 3,
  rules_version: "v1", winners_count: 3, counters: { opted_in: 0, games_in_window: 0, players_with_game: 0, eligible: 0, flagged_eligible: 0 }, participants: [], draw: null, ...over,
});
const summary = (e: AdminEvent): AdminEventSummary => ({ id: e.id, title: e.title, starts_at: e.starts_at, ends_at: e.ends_at, status: e.status, format: e.format, prize: e.prize, joined: 0 });

const wait = () => new Promise((r) => setTimeout(r, 30));
async function render(e: AdminEvent) {
  api.fetchAdminEvents.mockResolvedValue([summary(e)]);
  api.fetchAdminEvent.mockResolvedValue(e);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<EventTab />);
    await wait();
  });
}
const byText = (text: string) => Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent === text)!;
async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    await wait();
  });
}

describe("admin Events tab (#1019)", () => {
  it("shows the style and prize line, and no seed or draw for a top-finishers event (#1019)", async () => {
    await render(event());
    const text = host!.textContent!;
    expect(text).toContain("Single elimination · 8 players · Bo3");
    expect(text).toContain("Booster box");
    expect(host!.querySelector('section[aria-label="Seed and draw"]')).toBeNull();
    expect(host!.querySelector('section[aria-label="Prizes"]')).not.toBeNull();
  });

  it("shows the seed and draw panel for a random-draw event (#1019)", async () => {
    await render(event({ prize_method: "draw", format: "casual", bracket_size: null }));
    expect(host!.querySelector('section[aria-label="Seed and draw"]')).not.toBeNull();
  });

  it("deletes the event only after the admin confirms, then reloads the list (#1019)", async () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    api.deleteAdminEvent.mockResolvedValue({ deleted: "cup-2026-12" });
    await render(event());
    await click(byText("Delete"));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Friday Cup"));
    expect(api.deleteAdminEvent).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    api.fetchAdminEvents.mockResolvedValue([]);
    await click(byText("Delete"));
    expect(api.deleteAdminEvent).toHaveBeenCalledWith("cup-2026-12");
    expect(host!.textContent).toContain("No events yet");
  });

  it("cannot delete a drawn event (#1019)", async () => {
    const draw = { seed_hash: "h", committed_at: null, drawn_at: "2026-12-05T00:00:00Z", seed: "s", forfeited: [], ranking: [], winners: [] };
    await render(event({ prize_method: "draw", status: "drawn", draw }));
    expect(byText("Delete").disabled).toBe(true);
  });

  it("saves an edit without the locked fields and shows the server's refusal inline (#1019)", async () => {
    const draw = { seed_hash: "h", committed_at: null, drawn_at: null, seed: null, forfeited: [], ranking: [], winners: [] };
    await render(event({ prize_method: "draw", format: "casual", bracket_size: null, draw }));
    await click(byText("Edit"));
    api.updateAdminEvent.mockRejectedValue(new Error("The draw already ran"));
    await click(byText("Save"));
    const [id, body] = api.updateAdminEvent.mock.calls[0]!;
    expect(id).toBe("cup-2026-12");
    expect(body).not.toHaveProperty("prize_method");
    expect(body).toHaveProperty("starts_at", "2026-12-04T17:00:00.000Z");
    expect(host!.querySelector('form[aria-label="Edit event"] [role="alert"]')!.textContent).toBe("The draw already ran");
  });
});
