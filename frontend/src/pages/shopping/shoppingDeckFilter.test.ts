// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadShoppingDeckFilter, saveShoppingDeckFilter, savedShoppingDeckIds } from "./shoppingDeckFilter";
import { SHOPPING_DECKS_KEY } from "../../storage/keys";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("saveShoppingDeckFilter (refactor 0.5, C-07)", () => {
  it("does not throw when storage is blocked, as in private mode", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(() => saveShoppingDeckFilter([1, 2])).not.toThrow();
  });

  it("stores the ticked decks under the same key the loader reads", () => {
    saveShoppingDeckFilter([1, 3]);
    expect(localStorage.getItem(SHOPPING_DECKS_KEY)).toBe("[1,3]");
    expect(loadShoppingDeckFilter([1, 2, 3])).toEqual([1, 3]);
  });
});

describe("an empty deck selection (#1208)", () => {
  it("is restored as no decks ticked, not as all decks", () => {
    saveShoppingDeckFilter([]);
    expect(loadShoppingDeckFilter([1, 2, 3])).toEqual([]);
  });

  it("still counts every deck on deck pages and the collection", () => {
    saveShoppingDeckFilter([]);
    expect(savedShoppingDeckIds([1, 2, 3])).toBeUndefined();
    saveShoppingDeckFilter([3, 1]);
    expect(savedShoppingDeckIds([1, 2, 3])).toEqual([1, 3]);
  });
});
