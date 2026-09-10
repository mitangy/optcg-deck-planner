/**
 * Emit card atlas JSON for clients.
 * Usage: npm run export-atlas -- [outfile]
 * Default: mobile/assets/cardAtlas.json
 * Also write duel-web when no outfile given (keeps mobile + web in sync).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { buildCardAtlas } from "../cards/definitions.js";

const atlas = buildCardAtlas();
const json = `${JSON.stringify(atlas, null, 2)}\n`;

const explicit = process.argv[2];
const targets = explicit
  ? [resolve(process.cwd(), explicit)]
  : [
      resolve(process.cwd(), "../../mobile/assets/cardAtlas.json"),
      resolve(process.cwd(), "../../duel-web/src/assets/cardAtlas.json"),
      resolve(process.cwd(), "../../duel-web/public/cardAtlas.json"),
    ];

for (const out of targets) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, json, "utf8");
  console.log(`Wrote ${Object.keys(atlas).length} cards → ${out}`);
}
