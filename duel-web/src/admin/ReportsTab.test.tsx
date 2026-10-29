// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ReportRow } from "./adminApi";

const api = vi.hoisted(() => ({
  fetchAdminReports: vi.fn(),
  fetchReportImageUrl: vi.fn(async () => "blob:fake"),
  dismissReport: vi.fn(),
  removeReportImage: vi.fn(),
  warnReport: vi.fn(),
  banReport: vi.fn(),
}));
vi.mock("./adminApi", () => api);
const { ReportsTab } = await import("./ReportsTab");

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  // jsdom has no object URLs.
  URL.revokeObjectURL = () => undefined;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.clearAllMocks();
});

const row = (over: Partial<ReportRow> = {}): ReportRow => ({
  id: 1, created_at: "2026-10-29T14:03:00Z", status: "open", action: "", staff_note: "", handled_by_name: null, handled_at: null,
  reason: "image", image_kind: "playmat", note: "yikes", match_id: "m-1", source: "match", match_finished: true,
  has_image: true, cosmetic_id: 3, image_taken_down: false, reporter: { id: 2, name: "Nami" },
  reported: { id: 9, name: "Buggy", role: "user", banned: false, open_reports: 2, total_reports: 3, warnings: 1 }, ...over,
});

const wait = () => new Promise((r) => setTimeout(r, 30));
async function render(rows: ReportRow[], actor: { id: number; role: "moderator" | "admin" } = { id: 5, role: "moderator" }) {
  api.fetchAdminReports.mockResolvedValue(rows);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <MemoryRouter>
        <ReportsTab actor={actor} />
      </MemoryRouter>,
    );
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

describe("admin Reports tab (#810)", () => {
  it("keeps a reported image blurred until the moderator asks to see it (#810)", async () => {
    await render([row()]);
    const frame = () => document.querySelector<HTMLElement>(".rpt-image-frame")!;
    expect(frame().dataset.shown).toBe("false");
    expect(frame().querySelector("img")!.getAttribute("alt")).toBe("");
    await click(byText("Show image"));
    expect(frame().dataset.shown).toBe("true");
    await click(byText("Hide image"));
    expect(frame().dataset.shown).toBe("false");
  });

  it("disables Warn and Ban for a moderator against staff, with the reason, but not against a plain user (#810)", async () => {
    await render([row({ id: 1 }), row({ id: 2, reported: { ...row().reported, id: 10, name: "Staffer", role: "moderator" } })]);
    const cards = Array.from(document.querySelectorAll<HTMLElement>(".rpt-card"));
    const warn = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent === "Warn")!;
    expect(warn(cards[0]!).disabled).toBe(false);
    expect(warn(cards[1]!).disabled).toBe(true);
    expect(warn(cards[1]!).title).toMatch(/admin can act on staff/);
  });

  it("warns with the default message and updates the card in place without reordering the list (#810)", async () => {
    api.warnReport.mockResolvedValue(row({ id: 1, status: "actioned", action: "warned", handled_by_name: "Zed", handled_at: "2026-10-29T15:00:00Z" }));
    await render([row({ id: 1 }), row({ id: 2 })]);
    await click(byText("Warn"));
    expect(document.querySelector<HTMLTextAreaElement>(".rpt-field textarea")!.value).toBe("Please follow the Rules of conduct.");
    await click(byText("Send warning"));
    expect(api.warnReport).toHaveBeenCalledWith(1, "Please follow the Rules of conduct.");
    const cards = Array.from(document.querySelectorAll<HTMLElement>(".rpt-card"));
    expect(cards.map((c) => c.dataset.status)).toEqual(["actioned", "open"]);
    expect(cards[0]!.querySelector(".rpt-handled")!.textContent).toContain("Warned by Zed");
    // A handled report has no action buttons left.
    expect(Array.from(cards[0]!.querySelectorAll("button")).some((b) => b.textContent === "Dismiss")).toBe(false);
  });
});
