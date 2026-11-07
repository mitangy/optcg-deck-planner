// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { stopAccountSync } from "../account/accountSync";
import { getAuth, resetAuthForTests } from "../auth/session";
import { DuelSessionProvider } from "../state/DuelSession";
import { AuthCompletePage } from "./AuthCompletePage";
import { UsernameSetupPage } from "./UsernameSetupPage";

let root: Root | null = null;
let host: HTMLElement | null = null;
let calls: string[] = [];

const TOKEN = { token: "t.s", expires_at: 0, user_id: 7, email: "miko@e2e.test", rating: 1234, games_played: 0 };
const user = (username: string | null) => ({ id: 7, email: "miko@e2e.test", name: "Miko", username });

/** The fake API: `me` answers GET /auth/me (null = signed out); `claimed` answers POST /auth/claim. */
function fakeApi(opts: { me?: ReturnType<typeof user> | null; claimed?: ReturnType<typeof user>; claimStatus?: number }) {
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const path = new URL(url, "http://x").pathname;
    calls.push(`${init.method ?? "GET"} ${path}`);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    if (path === "/auth/claim") return opts.claimStatus ? json({ detail: "nope" }, opts.claimStatus) : json(opts.claimed ?? user("Miko"));
    if (path === "/duel/token") return json(TOKEN);
    if (path === "/auth/me") return opts.me ? json(opts.me) : json({ detail: "not signed in" }, 401);
    if (path === "/auth/me/username-suggestion") return json({ username: "SuggestedName" });
    return json({ detail: "not in this test" }, 404);
  });
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
  Element.prototype.scrollIntoView = () => {};
  window.scrollTo = () => {};
});

beforeEach(() => {
  resetAuthForTests();
  calls = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  stopAccountSync();
  localStorage.clear();
  window.location.hash = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mountAt(path: string) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <DuelSessionProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/auth/complete" element={<AuthCompletePage />} />
            <Route path="/welcome/username" element={<UsernameSetupPage />} />
            <Route path="/" element={<div data-testid="home">HOME</div>} />
          </Routes>
        </MemoryRouter>
      </DuelSessionProvider>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 150));
  });
}

const text = () => document.body.textContent ?? "";

describe("sign-in landing redirects (refactor 2.1b)", () => {
  it("claims the ticket from the URL fragment and lands a named account on the lobby", async () => {
    fakeApi({ claimed: user("Miko") });
    window.location.hash = "#ticket=abc123";
    await mountAt("/auth/complete");
    expect(calls).toContain("POST /auth/claim");
    expect(calls).toContain("POST /duel/token");
    expect(document.querySelector('[data-testid="home"]')).not.toBeNull();
    // The rest of the app (nav menu, lobby, account sync) learns who signed in from the auth store.
    expect(getAuth()).toMatchObject({ status: "ready", user: { id: 7 } });
  });

  it("sends an account with no username on to choose one", async () => {
    fakeApi({ claimed: user(null), me: user(null) });
    window.location.hash = "#ticket=abc123";
    await mountAt("/auth/complete");
    expect(text()).toContain("Choose a username");
    expect(document.querySelector('[data-testid="home"]')).toBeNull();
  });

  it("says the sign-in failed when the link carries no ticket, without calling the API", async () => {
    fakeApi({});
    window.location.hash = "";
    await mountAt("/auth/complete");
    expect(text()).toContain("Sign-in failed");
    expect(text()).toContain("This sign-in link is incomplete.");
    expect(calls).not.toContain("POST /auth/claim");
  });

  it("tells a banned account so, and does not claim", async () => {
    fakeApi({});
    window.location.hash = "#error=banned";
    await mountAt("/auth/complete");
    expect(text()).toContain("This account has been banned.");
    expect(calls).not.toContain("POST /auth/claim");
  });

  it("reports an expired ticket when the claim is refused", async () => {
    fakeApi({ claimStatus: 400 });
    window.location.hash = "#ticket=old";
    await mountAt("/auth/complete");
    expect(text()).toContain("expired or was already used");
  });
});

describe("username setup redirects (refactor 2.1b)", () => {
  it("sends a signed-out visitor home", async () => {
    fakeApi({ me: null });
    await mountAt("/welcome/username");
    expect(document.querySelector('[data-testid="home"]')).not.toBeNull();
  });

  it("sends an account that already has a username home", async () => {
    fakeApi({ me: user("Miko") });
    await mountAt("/welcome/username");
    expect(document.querySelector('[data-testid="home"]')).not.toBeNull();
  });

  it("keeps an account without a username here, with the suggestion filled in", async () => {
    fakeApi({ me: user(null) });
    await mountAt("/welcome/username");
    expect(document.querySelector('[data-testid="home"]')).toBeNull();
    expect(Array.from(document.querySelectorAll("input")).some((i) => i.value === "SuggestedName")).toBe(true);
  });

  it("signing out instead logs out, empties the auth store and goes home", async () => {
    fakeApi({ me: user(null) });
    await mountAt("/welcome/username");
    const out = Array.from(document.querySelectorAll("button")).find((b) => /Sign out instead/.test(b.textContent ?? ""))!;
    await act(async () => {
      out.click();
      await new Promise((r) => setTimeout(r, 100));
    });
    expect(calls).toContain("POST /auth/logout");
    expect(getAuth()).toEqual({ status: "signed-out", user: null });
    expect(document.querySelector('[data-testid="home"]')).not.toBeNull();
  });
});
