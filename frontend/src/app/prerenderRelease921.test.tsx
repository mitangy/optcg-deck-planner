// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./App", () => ({ default: () => <p data-testid="app">app</p> }));
vi.mock("@vercel/analytics/react", () => ({ Analytics: () => null }));
vi.mock("@vercel/speed-insights/react", () => ({ SpeedInsights: () => null }));
vi.mock("@optcg/ui/appShell", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@optcg/ui/appShell")>()),
  startUpdateChecks: () => undefined,
}));

// What #root looked like when main.tsx handed it to React, before React's first commit.
const seen: { marked?: boolean; landing?: boolean } = {};
vi.mock("react-dom/client", () => ({
  createRoot: (el: HTMLElement) => {
    seen.marked = el.hasAttribute("data-prerendered");
    seen.landing = el.querySelector(".landing") !== null;
    return { render: () => undefined, unmount: () => undefined };
  },
}));

const LANDING = '<div class="app public-app landing"><h1>Deck planner</h1></div>';

afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.className = "";
  localStorage.clear();
  vi.resetModules();
});

async function boot(signedIn: boolean) {
  document.body.innerHTML = `<div id="root" data-prerendered>${LANDING}</div>`;
  if (signedIn) {
    localStorage.setItem("optcg.signedIn", "1");
    document.documentElement.classList.add("signed-in-hint");
  }
  delete seen.marked;
  delete seen.landing;
  await import("../main");
  return { seen };
}

describe("pre-rendered #root is handed to the app (#921)", () => {
  it("a signed-in browser's app is not hidden by the pre-render rule, and never shows the logged-out page (#921)", async () => {
    const { seen } = await boot(true);
    expect(seen.marked).toBe(false);
    expect(seen.landing).toBe(false);
  });

  it("a visitor keeps the pre-rendered landing on screen while the app mounts (#921)", async () => {
    const { seen } = await boot(false);
    expect(seen.marked).toBe(false);
    expect(seen.landing).toBe(true);
  });
});
