import { describe, expect, it } from "vitest";
import { acceptsDrop } from "./useDeckDrag";

describe("acceptsDrop", () => {
  const planner = { kind: "planner" as const, ids: [1], label: "A" };
  const local = { kind: "local" as const, id: "planner-1", label: "A" };

  it("takes planner decks only into Your decks, and linked copies only back to the planner", () => {
    expect(acceptsDrop(planner, "local")).toBe(true);
    expect(acceptsDrop(planner, "planner")).toBe(false);
    expect(acceptsDrop(local, "planner")).toBe(true);
    expect(acceptsDrop(local, "local")).toBe(false);
    expect(acceptsDrop(planner, null)).toBe(false);
  });
});
