import { describe, expect, it } from "vitest";
import { GENERAL_SCOPE, canStartNewChat, duelDeckScope, groupThreads, isValidScope, matchScope, pageScope, plannerDeckScope, scopeKind, scopeLabel, type ThreadRow } from "./scopes";

const row = (id: number, scope: string, updated_at: string, title = `chat ${id}`): ThreadRow => ({ id, title, updated_at, scope });

describe("chat scopes (#970)", () => {
  it("accepts only the scope strings the server accepts (#970)", () => {
    for (const ok of ["general", "match:abc_DEF-123", `match:${"a".repeat(64)}`, "deck:planner:42", "deck:duel:d-1_x"]) expect(isValidScope(ok), ok).toBe(true);
    for (const bad of ["", "match:", `match:${"a".repeat(65)}`, "match:a b", "match:a.b", "deck:planner:abc", "deck:planner:", "deck:duel:", "deck:other:1", "General", "match:a:b"]) expect(isValidScope(bad), bad).toBe(false);
  });

  it("builds match and deck scopes, and refuses ids the server would reject (#970)", () => {
    expect(matchScope("m_1")).toBe("match:m_1");
    expect(plannerDeckScope(7)).toBe("deck:planner:7");
    expect(duelDeckScope("deck-9")).toBe("deck:duel:deck-9");
    // A ticket that could not be read comes back whole, dots and all: that is no match id.
    expect(matchScope("aaa.bbb.ccc")).toBeNull();
    expect(plannerDeckScope("x")).toBeNull();
  });

  it("gives a page the general chat unless it names a valid scope, and cuts and tidies its title (#970)", () => {
    expect(pageScope(null, "x")).toBeUndefined();
    expect(pageScope("general", "x")).toBeUndefined();
    expect(pageScope("deck:planner:abc", "x")).toBeUndefined();
    expect(pageScope("deck:planner:3", "  Zoro \n  Aggro ")).toEqual({ key: "deck:planner:3", title: "Zoro Aggro" });
    expect(pageScope("match:m1", "x".repeat(200))!.title).toHaveLength(80);
  });

  it("names the chat in the header by its kind (#970)", () => {
    expect(scopeLabel(GENERAL_SCOPE)).toBe("General");
    expect(scopeLabel({ key: "deck:planner:3", title: "Zoro Aggro" })).toBe("Deck: Zoro Aggro");
    expect(scopeLabel({ key: "match:m1", title: "Luffy vs Zoro" })).toBe("Match: Luffy vs Zoro");
    expect(scopeLabel({ key: "match:m1", title: "" })).toBe("Match: this game");
  });

  it("reads a scope's kind, treating anything invalid as general (#970)", () => {
    expect([scopeKind("match:m1"), scopeKind("deck:duel:d1"), scopeKind("deck:planner:1"), scopeKind("general"), scopeKind("nonsense"), scopeKind(null)]).toEqual(["match", "deck", "deck", "general", "general", "general"]);
  });

  it("starts a new chat only in a deck or the general chat, never in a match (#970)", () => {
    expect(canStartNewChat("match:m1")).toBe(false);
    expect(canStartNewChat("deck:planner:3")).toBe(true);
    expect(canStartNewChat("deck:duel:d1")).toBe(true);
    expect(canStartNewChat("general")).toBe(true);
  });
});

describe("the Chats list grouping (#970)", () => {
  const here = [row(10, "deck:planner:3", "2026-11-02T10:00:00Z"), row(11, "deck:planner:3", "2026-11-03T10:00:00Z")];
  const recent = [
    row(1, "general", "2026-11-04T10:00:00Z"),
    row(2, "match:m1", "2026-11-01T10:00:00Z"),
    row(3, "deck:duel:d1", "2026-11-03T09:00:00Z"),
    row(4, "match:m2", "2026-11-03T08:00:00Z"),
    row(10, "deck:planner:3", "2026-11-02T10:00:00Z"),
    row(5, "deck:planner:9", "2026-11-02T09:00:00Z"),
  ];

  it("puts this page's chats first, then matches, decks and general, each newest first, without repeating this page's chats (#970)", () => {
    const groups = groupThreads(here, recent, "deck:planner:3");
    expect(groups.map((g) => [g.id, g.threads.map((t) => t.id)])).toEqual([
      ["here", [11, 10]],
      ["match", [4, 2]],
      ["deck", [3, 5]],
      ["general", [1]],
    ]);
    expect(groups.map((g) => g.label)).toEqual(["This page", "Matches", "Decks", "General"]);
  });

  it("leaves empty groups out (#970)", () => {
    expect(groupThreads([], [row(1, "general", "2026-11-04T10:00:00Z")], "match:m1").map((g) => g.id)).toEqual(["general"]);
    expect(groupThreads([], [], "general")).toEqual([]);
  });

  it("on the general page lists general chats once, as the first group (#970)", () => {
    const groups = groupThreads([row(1, "general", "2026-11-04T10:00:00Z")], recent, "general");
    expect(groups.map((g) => [g.id, g.label, g.threads.map((t) => t.id)])).toEqual([
      ["here", "General", [1]],
      ["match", "Matches", [4, 2]],
      ["deck", "Decks", [3, 10, 5]],
    ]);
  });
});
