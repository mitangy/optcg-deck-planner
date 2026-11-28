// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { trackSettingChanged } from "./events";
import { isSeoLander, useProductEvents } from "./useProductEvents";

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
  sessionStorage.clear();
});

function Probe({ path, emit }: { path: string; emit: (name: string, props?: object) => void }) {
  useProductEvents(path, emit);
  return null;
}

function mount(path: string, emit: (name: string, props?: object) => void) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<MemoryRouter><Probe path={path} emit={emit} /></MemoryRouter>));
}

describe("funnel events in the duel app (#1499)", () => {
  it("only the search-facing pages count as a landing, the signed-in app does not (#1499)", () => {
    for (const p of ["/play-one-piece-tcg-online", "/optcg-sim-online", "/play-optcg-on-phone", "/decks/meta", "/leaders", "/leaders/op01-001"]) {
      expect(isSeoLander(p), p).toBe(true);
    }
    for (const p of ["/", "/decks", "/duel", "/history", "/leaderboard"]) expect(isSeoLander(p), p).toBe(false);
  });

  it("a visit that opens on a guide page records one landing with the path, and a reload does not record another (#1499)", () => {
    const emit = vi.fn();
    mount("/leaders/op01-001", emit);
    expect(emit).toHaveBeenCalledWith("landing", { path: "/leaders/op01-001" });
    act(() => root!.unmount());
    const again = vi.fn();
    mount("/leaders/op01-001", again);
    expect(again).not.toHaveBeenCalledWith("landing", expect.anything());
  });

  it("a visit that opens on the home page records no landing (#1499)", () => {
    const emit = vi.fn();
    mount("/", emit);
    expect(emit).not.toHaveBeenCalledWith("landing", expect.anything());
  });

  it("a sign-in link appearing on the page records one signup prompt, not one per re-render (#1499)", async () => {
    const emit = vi.fn();
    mount("/history", emit);
    expect(emit).not.toHaveBeenCalled();
    const link = document.createElement("a");
    link.href = "https://api.example/auth/google?return_to=https%3A%2F%2Fduel.example";
    document.body.appendChild(link);
    await act(async () => {
      await Promise.resolve();
    });
    link.textContent = "Sign in";
    await act(async () => {
      await Promise.resolve();
    });
    expect(emit.mock.calls.filter(([n]) => n === "signup_prompt_shown")).toEqual([["signup_prompt_shown", { path: "/history" }]]);
    link.remove();
  });

  it("a settings change reports the key of what changed and never the value or an unchanged key (#1499)", () => {
    const emit = vi.fn();
    trackSettingChanged({ reduceMotion: true, theme: "dark", devUserKey: "secret", bigBoardChosen: true }, { reduceMotion: false, theme: "dark", devUserKey: "", bigBoardChosen: false }, emit);
    expect(emit.mock.calls).toEqual([["setting_changed", { key: "reduceMotion" }]]);
  });
});
