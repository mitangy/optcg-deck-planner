// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Link, MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { lastSeenKey, notesFor, WhatsNewCard, WhatsNewFeed } from "@optcg/patch-notes";
import { PATCH_NOTES } from "@optcg/patch-notes/notes";

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
  localStorage.clear();
});

async function mount(node: React.ReactNode): Promise<HTMLElement> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  // The notes arrive from a dynamic import: let it resolve, then flush the state update it causes.
  await act(async () => {
    root!.render(<MemoryRouter>{node}</MemoryRouter>);
    await new Promise((r) => setTimeout(r, 50));
  });
  return host;
}

describe("What's new notes load on demand (refactor 1.5)", () => {
  it("the card fetches the notes after mount and announces what is newer than the last seen day", async () => {
    const duel = notesFor("duel", PATCH_NOTES);
    localStorage.setItem(lastSeenKey("duel"), duel[duel.length - 1].date);
    const el = await mount(<WhatsNewCard app="duel" Link={Link} />);
    expect(el.textContent).toContain(duel[0].title);
  });

  it("the card records the newest day for a first-time visitor once the notes arrive, and shows nothing", async () => {
    const el = await mount(<WhatsNewCard app="duel" Link={Link} />);
    expect(el.textContent).toBe("");
    expect(localStorage.getItem(lastSeenKey("duel"))).toBe(notesFor("duel", PATCH_NOTES)[0].date);
  });

  it("the page lists the app's notes once fetched, and counts the visit as seeing the latest update", async () => {
    const el = await mount(<WhatsNewFeed app="duel" />);
    const duel = notesFor("duel", PATCH_NOTES);
    expect(el.textContent).toContain(duel[0].title);
    expect(el.textContent).not.toContain(PATCH_NOTES.find((n) => n.app === "planner")!.title);
    expect(localStorage.getItem(lastSeenKey("duel"))).toBe(duel[0].date);
  });
});
