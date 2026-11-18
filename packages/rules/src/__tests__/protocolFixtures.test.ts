import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { protocolFixtureFiles } from "../testing/protocolFixtures.js";

const dir = fileURLToPath(new URL("../../protocol-fixtures/", import.meta.url));

describe("protocol fixtures", () => {
  it.each(Object.entries(protocolFixtureFiles()))("%s matches what the engine produces", (file, expected) => {
    const committed = JSON.parse(readFileSync(`${dir}${file}`, "utf8"));
    expect(committed).toEqual(JSON.parse(JSON.stringify(expected)));
  });
});
