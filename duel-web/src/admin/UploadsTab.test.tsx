// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { UploadRow } from "./adminApi";

const api = vi.hoisted(() => ({
  fetchAdminUploads: vi.fn(),
  fetchUploadImageUrl: vi.fn(async () => "blob:fake"),
  takeDownUpload: vi.fn(),
  restoreUpload: vi.fn(),
}));
vi.mock("./adminApi", () => api);
const { UploadsTab } = await import("./UploadsTab");

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
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

const row = (over: Partial<UploadRow> = {}): UploadRow => ({
  id: 7, kind: "playmat", mime: "image/png", size: 48 * 1024, created_at: "2026-10-29T14:03:00Z", in_use: true, report_count: 0,
  taken_down_at: null, taken_down_by_name: null, taken_down_reason: null,
  owner: { id: 9, name: "Buggy", role: "user", banned: false }, ...over,
});

const wait = () => new Promise((r) => setTimeout(r, 30));
async function render(rows: UploadRow[], actor: { id: number; role: "moderator" | "admin" } = { id: 5, role: "moderator" }) {
  api.fetchAdminUploads.mockResolvedValue({ total: rows.length, items: rows });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <MemoryRouter>
        <UploadsTab actor={actor} />
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
async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await wait();
  });
}

describe("admin Uploads tab (#812)", () => {
  it("keeps an upload blurred until the moderator asks to see it (#812)", async () => {
    await render([row()]);
    const frame = () => document.querySelector<HTMLElement>(".upl-frame")!;
    expect(frame().dataset.shown).toBe("false");
    expect(frame().querySelector("img")!.getAttribute("alt")).toBe("");
    await click(byText("Show image"));
    expect(frame().dataset.shown).toBe("true");
    await click(byText("Hide image"));
    expect(frame().dataset.shown).toBe("false");
  });

  it("asks for live uploads of both kinds first, then refetches for the filter picked (#812)", async () => {
    await render([row()]);
    expect(api.fetchAdminUploads).toHaveBeenLastCalledWith("live", null, 0, 24);
    await click(byText("Taken down"));
    expect(api.fetchAdminUploads).toHaveBeenLastCalledWith("taken_down", null, 0, 24);
    await click(byText("Card back"));
    expect(api.fetchAdminUploads).toHaveBeenLastCalledWith("taken_down", "cardBack", 0, 24);
  });

  it("shows the owner, kind, size, In use and report count on the card (#812)", async () => {
    await render([row({ report_count: 2 })]);
    const text = document.querySelector(".upl-card")!.textContent!;
    expect(text).toContain("Buggy");
    expect(text).toContain("Playmat");
    expect(text).toContain("48 KB");
    expect(text).toContain("In use");
    expect(text).toContain("2 reports");
  });

  it("takes an upload down with the chosen reason and marks the card in place (#812)", async () => {
    api.takeDownUpload.mockResolvedValue(row({ taken_down_at: "2026-10-29T15:00:00Z", taken_down_by_name: "Zed", taken_down_reason: "Copyright notice: DMCA email", in_use: false }));
    await render([row({ id: 7 }), row({ id: 8 })]);
    await click(byText("Take down"));
    expect(api.takeDownUpload).not.toHaveBeenCalled();
    await type(document.querySelector<HTMLInputElement>(".upl-form input")!, "DMCA email");
    await click(byText("Confirm take down"));
    expect(api.takeDownUpload).toHaveBeenCalledWith(7, "Copyright notice: DMCA email");
    const cards = Array.from(document.querySelectorAll<HTMLElement>(".upl-card"));
    expect(cards.map((c) => c.dataset.down)).toEqual(["true", "false"]);
    expect(cards[0]!.textContent).toContain("Taken down by Zed");
    expect(document.querySelector(".upl-form")).toBeNull();
  });

  it("offers Restore to an admin only, on a taken-down upload (#812)", async () => {
    const down = row({ taken_down_at: "2026-10-29T15:00:00Z", taken_down_reason: "Explicit" });
    await render([down], { id: 5, role: "moderator" });
    expect(Array.from(document.querySelectorAll("button")).some((b) => b.textContent === "Restore")).toBe(false);
    expect(Array.from(document.querySelectorAll("button")).some((b) => b.textContent === "Take down")).toBe(false);
    act(() => root?.unmount());
    host?.remove();
    await render([down], { id: 1, role: "admin" });
    expect(byText("Restore")).toBeTruthy();
  });
});
