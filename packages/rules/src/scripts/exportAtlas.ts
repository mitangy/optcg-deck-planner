/**
 * Emit card atlas JSON for the Expo client.
 * Usage: npm run export-atlas -- [outfile]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { buildCardAtlas } from "../cards/definitions.js";

const out =
  process.argv[2] ??
  resolve(process.cwd(), "../../mobile/assets/cardAtlas.json");

const atlas = buildCardAtlas();
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(atlas, null, 2)}\n`, "utf8");
console.log(`Wrote ${Object.keys(atlas).length} cards → ${out}`);
