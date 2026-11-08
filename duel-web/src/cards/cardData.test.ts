import { describe, expect, it, vi } from "vitest";
import { createCardDataLoader, type CardData } from "./cardData";

const rows: CardData = { curated: { "OP01-001": {} }, catalog: {} };

describe("card data loader (refactor 1.5b)", () => {
  it("fetches the card data once for concurrent and later callers", async () => {
    const importer = vi.fn(async () => rows);
    const apply = vi.fn();
    const load = createCardDataLoader(importer, apply);
    await Promise.all([load(), load()]);
    await load();
    expect(importer).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(rows);
  });

  it("retries after a failed load instead of caching the failure", async () => {
    const importer = vi.fn<() => Promise<CardData>>().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(rows);
    const apply = vi.fn();
    const load = createCardDataLoader(importer, apply);
    await expect(load()).rejects.toThrow("offline");
    await load();
    expect(importer).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenCalledTimes(1);
  });
});
