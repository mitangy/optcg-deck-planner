import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { protocolFixtureFiles } from "../testing/protocolFixtures.js";

const dir = fileURLToPath(new URL("../../protocol-fixtures/", import.meta.url));

describe("protocol fixtures", () => {
  // game-server, duel-web and mobile load these files in their own tests. If the
  // engine's wire shapes change, regenerate them (npm run export-protocol-fixtures
  // -w @optcg/rules) so every consumer is then tested against the new shapes.
  it.each(Object.entries(protocolFixtureFiles()))("%s matches what the engine produces", (file, expected) => {
    const committed = JSON.parse(readFileSync(`${dir}${file}`, "utf8"));
    expect(committed).toEqual(JSON.parse(JSON.stringify(expected)));
  });
});
