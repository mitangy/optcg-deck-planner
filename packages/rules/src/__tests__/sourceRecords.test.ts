import { describe, expect, it } from "vitest";
import { CARD_SOURCE_RECORDS, cardSourceRecord } from "../cards/sourceRecords.js";
import { listCatalogMetaIds } from "../cards/catalogMeta.js";

describe("authoritative source ledger", () => {
  it("accounts for every bundled catalog id and uses explicit unknown states", () => {
    expect(Object.keys(CARD_SOURCE_RECORDS).sort()).toEqual(listCatalogMetaIds());
    expect(cardSourceRecord("OP01-016")).toMatchObject({ sourceUrl: null, fields: { counter: "unknown", traits: "unknown", errata: "unknown" } });
  });

  it("records the official revision used for confirmed ST01 and Teach corrections", () => {
    expect(cardSourceRecord("ST01-005")).toMatchObject({ sourceRevision: "reviewed-2026-09-14", fields: { identity: "verified", rulesText: "verified", stats: "verified", counter: "verified" } });
    expect(cardSourceRecord("OP16-080")?.sourceUrl).toContain("series=569116");
    expect(cardSourceRecord("ST01-005")?.fields).toMatchObject({ traits: "unknown", errata: "unknown" });
  });
});
