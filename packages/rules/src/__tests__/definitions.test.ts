import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ABILITY_REGISTRY, abilitiesFor, buildAbilityRegistry, RegistryValidationError } from "../cards/abilities.js";
import { listCardDataIds } from "../cards/cardData.js";
import { buildCardAtlas, ensureCardDef, getCardDef, listCardDefs, normalizeCardDefId } from "../cards/definitions.js";
import { abilitySupportForCard, buildCardSupportManifest, unsupportedCardsForDeck } from "../cards/effectCatalog.js";
import { CARD_SOURCE_RECORDS, cardSourceRecord } from "../cards/sourceRecords.js";
import { generateAbilities, serializeGenerated } from "../tools/cardText/generate.js";

describe("card data", () => {
  it("covers every catalog id (official list plus flagged bundled rows)", () => {
    const ids = listCardDataIds();
    expect(ids.length).toBe(2834);
    const official = listCardDefs().filter((d) => d.dataSource === "bandai");
    expect(official.length).toBe(2785);
    expect(listCardDefs().filter((d) => d.dataSource === "bundled").length).toBe(49);
  });

  it("carries the confirmed ST01 and Teach corrections from official data", () => {
    expect(getCardDef("ST01-004")).toMatchObject({ name: "Sanji", cost: 2, power: 4000 });
    expect(getCardDef("ST01-004").counter).toBeUndefined();
    expect(getCardDef("ST01-005")).toMatchObject({ name: "Jinbe", cost: 3, power: 5000 });
    expect(getCardDef("ST01-005").counter).toBeUndefined();
    expect(getCardDef("ST01-001").effectText).not.toMatch(/rest this Leader/i);
    expect(getCardDef("OP16-080").effectText).toMatch(/Opponent's Turn/);
    expect(getCardDef("ST01-003").counter).toBe(1000);
    expect(getCardDef("OP17-001").traits).toEqual(expect.arrayContaining(["Whitebeard Pirates"]));
  });

  it("maps parallel-art ids to the base card and stubs unknown ids as unverified", () => {
    expect(normalizeCardDefId("op01-016_p1")).toBe("OP01-016");
    const stub = ensureCardDef("ZZ99-001");
    expect(stub.dataSource).toBe("stub");
    expect(abilitySupportForCard("ZZ99-001")).toBe("unverified");
  });

  it("does not infer keywords from text mentions", () => {
    // Roger's text mentions an opponent activating [Blocker]; he has Rush, not Blocker.
    const atlas = buildCardAtlas();
    expect(atlas["OP09-118"]?.blocker).toBeUndefined();
    expect(atlas["OP09-118"]?.rush).toBe(true);
    expect(atlas["ST01-006"]?.blocker).toBe(true);
    expect(atlas["ST01-004"]?.rush).toBeUndefined();
  });

  it("records provenance for every card", () => {
    expect(Object.keys(CARD_SOURCE_RECORDS).length).toBe(2834);
    expect(cardSourceRecord("ST01-005")?.fields).toMatchObject({ identity: "verified", counter: "verified", errata: "unknown" });
    expect(cardSourceRecord("EB05-002")?.fields.identity).toBe("unverified");
  });
});

describe("ability registry", () => {
  it("validates every card and matches deterministic regeneration", () => {
    expect(ABILITY_REGISTRY.cards.size).toBe(2834);
    const text = serializeGenerated(generateAbilities());
    const current = readFileSync(resolve(__dirname, "../cards/generated/abilities.json"), "utf8").replace(/\r\n/g, "\n");
    expect(current === text, "generated abilities.json is stale: run npx tsx src/tools/cardText/generate.ts").toBe(true);
    expect(serializeGenerated(generateAbilities()) === text).toBe(true);
  });

  it("rejects unknown operations, fields, and duplicate ability ids with paths", () => {
    const base = { id: "X-1", schemaVersion: 2, unsupported: [], status: "supported", origin: "manual" };
    const bad = (abilities: unknown[]) => () => buildAbilityRegistry({ "X-1": { ...base, abilities } });
    expect(bad([{ id: "a", trigger: "on_play", text: "", effect: { do: "teleport" } }])).toThrow(/cards\[X-1\]\.abilities\[0\]\.effect\.do: unknown variant teleport/);
    expect(bad([{ id: "a", trigger: "on_play", text: "", effect: { do: "draw", player: "you", count: 1, extra: true } }])).toThrow(/extra: unknown field/);
    expect(bad([{ id: "a", trigger: "on_play", text: "", effect: { do: "nothing" } }, { id: "a", trigger: "main", text: "", effect: { do: "nothing" } }])).toThrow(RegistryValidationError);
    expect(bad([{ id: "a", trigger: "static", text: "" }])).toThrow(/static ability requires statics/);
  });

  it("keeps printed abilities immutable at runtime", () => {
    const ability = abilitiesFor("OP01-016")[0]!;
    expect(Object.isFrozen(ability)).toBe(true);
    expect(() => { (ability as { id: string }).id = "x"; }).toThrow();
  });
});

describe("support manifest and ranked gate", () => {
  it("labels every catalog card and blocks decks with unsupported cards", () => {
    const manifest = buildCardSupportManifest();
    expect(Object.keys(manifest).length).toBe(2834);
    expect(manifest["ST01-003"]).toBe("none");
    expect(manifest["ST01-006"]).toBe("keywords");
    expect(manifest["OP01-016"]).toBe("ok");
    const unsupported = Object.entries(manifest).find(([, s]) => s === "unsupported")?.[0];
    expect(unsupported).toBeDefined();
    expect(unsupportedCardsForDeck({ leaderId: "ST01-001", deck: ["ST01-003", unsupported!] })).toEqual([{ cardId: unsupported, support: "unsupported" }]);
    expect(unsupportedCardsForDeck({ leaderId: "ST01-001", deck: ["ST01-003", "OP01-016"] })).toEqual([]);
  });
});
