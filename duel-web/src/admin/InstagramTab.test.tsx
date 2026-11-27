// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { IgPost, IgReel } from "./adminApi";

const api = vi.hoisted(() => ({
  fetchIgReels: vi.fn(),
  fetchIgPosts: vi.fn(),
  checkIgReels: vi.fn(),
  uploadIgReel: vi.fn(),
  updateIgReel: vi.fn(),
  deleteIgReel: vi.fn(async () => undefined),
}));
vi.mock("./adminApi", () => api);
const { InstagramTab } = await import("./InstagramTab");

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = host = null;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const reel = (over: Partial<IgReel> = {}): IgReel => ({
  id: 3, title: "OP15 trailer", caption: "cap", size_bytes: 5 * 1024 * 1024, duration_ms: 30000, uploaded_at: "2026-11-20T10:00:00Z", posted_count: 2, last_posted_at: "2026-11-24T17:00:00Z", active: true, ...over,
});
const post = (over: Partial<IgPost> = {}): IgPost => ({
  id: 1, kind: "reel", slot_date: "2026-11-24", subject: "reel-3", status: "published", attempts: 1, ig_media_id: "m1", error: null, caption: "c",
  created_at: null, published_at: null, reel_id: 3, audio_id: "a1", audio_title: "Big Song", audio_artist: "The Band", reel_error: null, ...over,
});

const wait = () => new Promise((r) => setTimeout(r, 30));
async function render(reels: IgReel[] = [reel()], posts: IgPost[] = [post()]) {
  api.fetchIgReels.mockResolvedValue(reels);
  api.fetchIgPosts.mockResolvedValue(posts);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<InstagramTab />);
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

describe("InstagramTab (#1482)", () => {
  it("lists reels with size, posted count and last posted, and posts with the song of a Reel", async () => {
    await render([reel()], [post(), post({ id: 2, kind: "feature", slot_date: "2026-11-23", audio_title: null, audio_artist: null, reel_id: null })]);
    const text = document.body.textContent ?? "";
    expect(text).toContain("OP15 trailer");
    expect(text).toContain("5.0 MB");
    expect(text).toContain("posted 2×");
    expect(text).toContain("last 2026-11-24 17:00");
    expect(text).toContain("♪ Big Song — The Band");
    expect(document.querySelectorAll(".igt-post-song")[1]!.textContent).toBe("");
  });

  it("shows why a Reel became an image post", async () => {
    await render([], [post({ kind: "feature", reel_id: null, audio_title: null, audio_artist: null, reel_error: "Reel failed: Instagram container ERROR" })]);
    expect(document.body.textContent).toContain("Reel failed: Instagram container ERROR. Posted an image instead.");
  });

  it("deletes a reel only after the admin confirms", async () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    await render();
    await click(byText("Delete"));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("OP15 trailer"));
    expect(api.deleteIgReel).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await click(byText("Delete"));
    expect(api.deleteIgReel).toHaveBeenCalledWith(3);
    expect(document.body.textContent).not.toContain("posted 2×");
  });

  it("toggles a reel active through the server and shows the saved value", async () => {
    api.updateIgReel.mockResolvedValue(reel({ active: false }));
    await render();
    await click(document.querySelector<HTMLInputElement>(".igt-active input")!);
    expect(api.updateIgReel).toHaveBeenCalledWith(3, { active: false });
    expect(document.querySelector<HTMLInputElement>(".igt-active input")!.checked).toBe(false);
  });

  it("shows the setup check in plain words, ready or not", async () => {
    await render();
    api.checkIgReels.mockResolvedValueOnce({ ready: true, token_kind: "facebook", user_id: "1", username: "optcgduel", song_count: 4, first_song: "S — A", message: "ok" });
    await click(byText("Check Reels setup"));
    expect(document.querySelector(".igt-check-text")!.textContent).toContain("Ready: trending songs found");
    api.checkIgReels.mockResolvedValueOnce({ ready: false, token_kind: "facebook", user_id: "1", username: null, song_count: 0, first_song: null, message: "No page linked" });
    await click(byText("Check Reels setup"));
    const t = document.querySelector(".igt-check-text")!.textContent ?? "";
    expect(t).toContain("Not ready: No page linked");
    expect(t).toContain("Link @optcgduel to a Facebook Page.");
  });

  it("uploads the chosen video with its title and caption and lists the new reel first", async () => {
    api.uploadIgReel.mockResolvedValue(reel({ id: 9, title: "New trailer", posted_count: 0, last_posted_at: null }));
    await render();
    const file = new File([new Uint8Array([0, 0, 0, 24])], "t.mp4", { type: "video/mp4" });
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
    const setValue = (el: HTMLInputElement | HTMLTextAreaElement, v: string) => {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    await act(async () => {
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      setValue(document.querySelector<HTMLInputElement>('.igt-form input[type="text"]')!, "New trailer");
      setValue(document.querySelector<HTMLTextAreaElement>(".igt-form textarea")!, "Watch #Luffy");
      await wait();
    });
    await click(byText("Upload Reel"));
    expect(api.uploadIgReel).toHaveBeenCalledWith(file, "New trailer", "Watch #Luffy");
    const titles = Array.from(document.querySelectorAll(".igt-reel-title")).map((e) => e.textContent);
    expect(titles).toEqual(["New trailer", "OP15 trailer"]);
  });
});
