import { describe, expect, it } from "vitest";
import type { CatalogHashManifest } from "./api";
import { findBestMatch } from "./hashMatch";

function manifest(printings: CatalogHashManifest["printings"]): CatalogHashManifest {
  return { version: "test", printings };
}

describe("findBestMatch", () => {
  it("returns null against an empty manifest", () => {
    expect(findBestMatch("0000000000000000", manifest([]))).toBeNull();
  });

  it("picks the exact match when the scanned hash is present verbatim", () => {
    const m = manifest([
      { product_id: 1, card_id: "OP01-001", phash: "aaaaaaaaaaaaaaaa" },
      { product_id: 2, card_id: "OP01-002", phash: "0000000000000000" },
    ]);
    const result = findBestMatch("aaaaaaaaaaaaaaaa", m);
    expect(result).not.toBeNull();
    expect(result!.printing.card_id).toBe("OP01-001");
    expect(result!.distance).toBe(0);
  });

  it("picks the closest hash under noise and reports the runner-up gap", () => {
    const m = manifest([
      // Off by one bit from the scan below.
      { product_id: 1, card_id: "OP01-001", phash: "aaaaaaaaaaaaaaab" },
      // Off by many bits.
      { product_id: 2, card_id: "OP01-002", phash: "5555555555555555" },
    ]);
    const result = findBestMatch("aaaaaaaaaaaaaaaa", m);
    expect(result).not.toBeNull();
    expect(result!.printing.card_id).toBe("OP01-001");
    expect(result!.distance).toBe(1);
    expect(result!.runnerUp).not.toBeNull();
    expect(result!.runnerUp!.printing.card_id).toBe("OP01-002");
    expect(result!.runnerUp!.distance).toBeGreaterThan(result!.distance);
  });

  it("has no runner-up when only one printing exists", () => {
    const m = manifest([{ product_id: 1, card_id: "OP01-001", phash: "aaaaaaaaaaaaaaaa" }]);
    const result = findBestMatch("aaaaaaaaaaaaaaaa", m);
    expect(result!.runnerUp).toBeNull();
  });

  it("breaks ties by keeping the first-seen printing as best", () => {
    const m = manifest([
      { product_id: 1, card_id: "OP01-001", phash: "aaaaaaaaaaaaaaaa" },
      { product_id: 2, card_id: "OP01-002", phash: "aaaaaaaaaaaaaaaa" },
    ]);
    const result = findBestMatch("bbbbbbbbbbbbbbbb", m);
    expect(result!.printing.card_id).toBe("OP01-001");
    expect(result!.runnerUp!.printing.card_id).toBe("OP01-002");
    expect(result!.distance).toBe(result!.runnerUp!.distance);
  });
});
