import { describe, expect, it } from "vitest";
import { buildHandoffUrl, consumeHandoffOnLoad } from "./handoff";

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

describe("handoff on load (#1502)", () => {
  it("removes the ticket from the address bar before the claim request, keeping the path and other params (#1502)", async () => {
    const { page, history } = fakePage("/decks/12?from=duel#handoff=SECRET&hu=7&list=abc");
    let seenAtClaim = "";
    const outcome = await consumeHandoffOnLoad({
      location: page,
      history,
      audience: "planner",
      currentUserId: async () => null,
      claim: async (ticket) => {
        seenAtClaim = `${page.pathname}${page.search}${page.hash}|${ticket}`;
      },
    });
    expect(outcome).toBe("claimed");
    expect(seenAtClaim).toBe("/decks/12?from=duel#list=abc|SECRET");
  });

  it("does not claim when already signed in as the account the ticket is for (#1502)", async () => {
    const { page, history } = fakePage("/#handoff=T&hu=7");
    let claimed = false;
    const outcome = await consumeHandoffOnLoad({
      location: page,
      history,
      audience: "planner",
      currentUserId: async () => 7,
      claim: async () => {
        claimed = true;
      },
    });
    expect(outcome).toBe("skipped");
    expect(claimed).toBe(false);
    expect(page.hash).toBe("");
  });

  it("claims when signed in as a different account (#1502)", async () => {
    const { page, history } = fakePage("/#handoff=T&hu=7");
    let claimed = false;
    await consumeHandoffOnLoad({
      location: page,
      history,
      audience: "planner",
      currentUserId: async () => 9,
      claim: async () => {
        claimed = true;
      },
    });
    expect(claimed).toBe(true);
  });

  it("a failed claim stays quiet and leaves the clean path (#1502)", async () => {
    const { page, history } = fakePage("/cards/OP01-001#handoff=T&hu=7");
    const outcome = await consumeHandoffOnLoad({
      location: page,
      history,
      audience: "planner",
      currentUserId: async () => null,
      claim: async () => {
        throw new Error("Invalid or expired login ticket");
      },
    });
    expect(outcome).toBe("failed");
    expect(page.pathname + page.hash).toBe("/cards/OP01-001");
  });

  it("does nothing to a page without a ticket (#1502)", async () => {
    const { page, history, urls } = fakePage("/decks#list=abc");
    const outcome = await consumeHandoffOnLoad({
      location: page,
      history,
      audience: "planner",
      currentUserId: async () => null,
      claim: async () => undefined,
    });
    expect(outcome).toBe("none");
    expect(urls).toEqual([]);
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
