/**
 * Write the golden duel-protocol fixtures shared by game-server, duel-web and mobile.
 * Usage: npm run export-protocol-fixtures
 * Default output: packages/rules/protocol-fixtures
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { protocolFixtureFiles } from "../testing/protocolFixtures.js";

const dir = resolve(process.cwd(), process.argv[2] ?? "protocol-fixtures");
mkdirSync(dir, { recursive: true });
for (const [file, value] of Object.entries(protocolFixtureFiles())) {
  writeFileSync(resolve(dir, file), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  console.log(`Wrote ${file}`);
}
