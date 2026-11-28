import { afterEach, describe, expect, it, vi } from "vitest";
import { buildHandoffUrl, consumeHandoffOnLoad, otherAppClickHandler } from "./handoff";

function fakePage(url: string) {
  const u = new URL(`https://optcg-deck-planner.app${url}`);
  const page = { pathname: u.pathname, search: u.search, hash: u.hash };
  const urls: string[] = [];
  const history = {
    replaceState: (_d: unknown, _t: string, next?: string | null) => {
      urls.push(String(next));
      const n = new URL(String(next), "https://optcg-deck-planner.app");
      page.pathname = n.pathname;
      page.search = n.search;
      page.hash = n.hash;
    },
  };
  return { page, history, urls };
}

const SIBLING = "https://optcgduel.app";

function run(
  url: string,
  o: { current?: number | null; referrer?: string; claim?: (ticket: string) => Promise<unknown> } = {},
) {
  const { page, history, urls } = fakePage(url);
  const claim = vi.fn(o.claim ?? (async () => undefined));
  const outcome = consumeHandoffOnLoad({
    location: page,
    history,
    audience: "planner",
    referrer: o.referrer ?? `${SIBLING}/`,
    siblingOrigin: SIBLING,
    currentUserId: async () => o.current ?? null,
    claim,
  });
  return { page, urls, claim, outcome };
}

describe("handoff on load (#1502)", () => {
  it("removes the ticket from the address bar before the claim request, keeping the path and other params (#1502)", async () => {
    let seenAtClaim = "";
    const { page, outcome } = run("/decks/12?from=duel#handoff=SECRET&hu=7&list=abc", {
      claim: async (ticket) => {
        seenAtClaim = `${page.pathname}${page.search}${page.hash}|${ticket}`;
      },
    });
    expect(await outcome).toBe("claimed");
    expect(seenAtClaim).toBe("/decks/12?from=duel#list=abc|SECRET");
  });

  it("signed out and sent from the sibling app: claims (#1502)", async () => {
    const { claim, outcome } = run("/#handoff=T&hu=7", { referrer: "https://optcgduel.app/" });
    expect(await outcome).toBe("claimed");
    expect(claim).toHaveBeenCalledWith("T", "planner");
  });

  it("signed out but not sent from the sibling app (foreign or no referrer): drops the ticket without claiming (#1502)", async () => {
    for (const referrer of ["https://evil.example/page", "", "https://optcgduel.app.evil.example/"]) {
      const { claim, outcome, page } = run("/decks/3#handoff=T&hu=7", { referrer });
      expect(await outcome).toBe("ignored");
      expect(claim).not.toHaveBeenCalled();
      expect(page.hash).toBe("");
    }
  });

  it("signed in as a different account: never claims (#1502)", async () => {
    const { claim, outcome } = run("/#handoff=T&hu=7", { current: 9 });
    expect(await outcome).toBe("ignored");
    expect(claim).not.toHaveBeenCalled();
  });

  it("signed in and the ticket does not say whose it is: never claims (#1502)", async () => {
    const { claim, outcome } = run("/#handoff=T", { current: 9 });
    expect(await outcome).toBe("ignored");
    expect(claim).not.toHaveBeenCalled();
  });

  it("already signed in as the same account: spends the ticket in the background and does not wait for it (#1502)", async () => {
    const { claim, outcome } = run("/#handoff=T&hu=7", { current: 7, claim: () => new Promise(() => undefined) });
    expect(await outcome).toBe("skipped");
    expect(claim).toHaveBeenCalledWith("T", "planner");
  });

  it("a failed claim stays quiet and leaves the clean path (#1502)", async () => {
    const { page, outcome } = run("/cards/OP01-001#handoff=T&hu=7", {
      claim: async () => {
        throw new Error("Invalid or expired login ticket");
      },
    });
    expect(await outcome).toBe("failed");
    expect(page.pathname + page.hash).toBe("/cards/OP01-001");
  });

  it("does nothing to a page without a ticket (#1502)", async () => {
    const { urls, outcome, claim } = run("/decks#list=abc");
    expect(await outcome).toBe("none");
    expect(urls).toEqual([]);
    expect(claim).not.toHaveBeenCalled();
  });
});

describe("handoff URL (#1502)", () => {
  it("puts the ticket in the fragment next to an existing deck paste, never in the query (#1502)", () => {
    const url = buildHandoffUrl("https://optcgduel.app/", "/decks?planner=5#list=1xOP01-001&name=My%20Deck", {
      ticket: "TICKET",
      userId: 3,
    });
    const u = new URL(url);
    expect(u.search).toBe("?planner=5");
    expect(u.searchParams.has("handoff")).toBe(false);
    const hash = new URLSearchParams(u.hash.slice(1));
    expect(hash.get("handoff")).toBe("TICKET");
    expect(hash.get("list")).toBe("1xOP01-001");
    expect(hash.get("name")).toBe("My Deck");
  });

  it("is the plain link when there is no ticket (#1502)", () => {
    expect(buildHandoffUrl("https://optcgduel.app", "/decks", null)).toBe("https://optcgduel.app/decks");
  });
});

describe("other-app click handler (#1502)", () => {
  afterEach(() => vi.unstubAllGlobals());

  const mint = async () => ({ ticket: "TK", user_id: 4 });
  const click = (over: Record<string, unknown> = {}) => ({ button: 0, preventDefault: vi.fn(), ...over });

  function stubWindow(open: () => unknown) {
    const assign = vi.fn();
    const openFn = vi.fn(open);
    vi.stubGlobal("window", { open: openFn, location: { assign } });
    return { openFn, assign };
  }

  it("opens the tab first, cuts its link back to this page, then sends it to the URL with the ticket (#1502)", async () => {
    const win = { opener: "this-page" as unknown, location: { replace: vi.fn() } };
    const { openFn } = stubWindow(() => win);
    const e = click();
    otherAppClickHandler("https://optcg-deck-planner.app", "/decks/5?from=duel", mint, { newTab: true })(e);
    expect(openFn).toHaveBeenCalledTimes(1);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(win.opener).toBeNull();
    await vi.waitFor(() => expect(win.location.replace).toHaveBeenCalled());
    const url = new URL(win.location.replace.mock.calls[0][0]);
    expect(url.origin + url.pathname + url.search).toBe("https://optcg-deck-planner.app/decks/5?from=duel");
    expect(new URLSearchParams(url.hash.slice(1)).get("handoff")).toBe("TK");
  });

  it("leaves modified clicks to the browser's plain link (#1502)", () => {
    const { openFn, assign } = stubWindow(() => ({}));
    for (const over of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
      const e = click(over);
      otherAppClickHandler("https://x.app", "/", mint, { newTab: true })(e);
      expect(e.preventDefault).not.toHaveBeenCalled();
    }
    expect(openFn).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it("a guest (no ticket minter) gets the plain link untouched (#1502)", () => {
    const { openFn } = stubWindow(() => ({}));
    const e = click();
    otherAppClickHandler("https://x.app", "/", null, { newTab: true })(e);
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(openFn).not.toHaveBeenCalled();
  });

  it("when the popup is blocked it falls back to the plain link instead of moving this tab (#1502)", () => {
    const { assign } = stubWindow(() => null);
    const e = click();
    otherAppClickHandler("https://x.app", "/", mint, { newTab: true })(e);
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });
});
