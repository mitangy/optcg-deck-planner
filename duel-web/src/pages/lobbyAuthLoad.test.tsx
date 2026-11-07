// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { stopAccountSync, watchAccountSync } from "../account/accountSync";
import { resetAuthForTests } from "../auth/session";
import { DuelSessionProvider } from "../state/DuelSession";
import { LobbyPage } from "./LobbyPage";

let root: Root | null = null;
let host: HTMLElement | null = null;
let stopWatching: (() => void) | null = null;
let paths: string[] = [];

const USER = { id: 7, email: "miko@e2e.test", name: "Miko", username: "MikoTheNavigator" };

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
  (globalThis as { CSS?: unknown }).CSS = { escape: (v: string) => v, supports: () => false };
  Element.prototype.scrollIntoView = () => {};
  window.scrollTo = () => {};
});

beforeEach(() => {
  resetAuthForTests();
  paths = [];
  vi.stubGlobal("fetch", async (url: string) => {
    const path = new URL(url, "http://x").pathname;
    paths.push(path);
    if (path === "/auth/me") return new Response(JSON.stringify(USER), { status: 200 });
    return new Response(JSON.stringify({ detail: "not in this test" }), { status: 404 });
  });
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  stopWatching?.();
  stopWatching = null;
  stopAccountSync();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("a cold lobby load (refactor 2.1b)", () => {
  it("asks /auth/me once for the app start, the nav menu and the lobby together, not once each", async () => {
    // main.tsx starts the account sync before anything renders.
    stopWatching = watchAccountSync();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(
        <DuelSessionProvider>
          <MemoryRouter initialEntries={["/"]}>
            <Routes>
              <Route path="/" element={<LobbyPage />} />
            </Routes>
          </MemoryRouter>
        </DuelSessionProvider>,
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });
    expect(paths.filter((p) => p === "/auth/me")).toHaveLength(1);
    // The lobby did take the answer: it reads the signed-in player's Bounty.
    expect(paths).toContain("/duel/rating/me");
  });
});
