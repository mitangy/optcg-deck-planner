#!/usr/bin/env node
/** Download the users' confirmed scan crops for retraining the art embedder (#852).
 *
 *   SCAN_TRAINING_TOKEN=... node scripts/fetch-scan-samples.mjs <outDir>
 *
 * Pages through `GET {API_URL}/scan-samples/export` and writes `<outDir>/<id>.jpg`
 * plus `<outDir>/index.json` ([{id, file, split, card_id, label}]).
 *
 * These are user photos and the repo is public: this script prints COUNTS only
 * (never ids, card ids or image data), and callers must keep <outDir> out of
 * artifacts and caches and delete it afterwards.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_API = "https://optcg-api-nutb.onrender.com";
const PAGE = 500;

async function getPage(base, token, afterId) {
  const url = `${base}/scan-samples/export?after_id=${afterId}&limit=${PAGE}`;
  for (let attempt = 1; ; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { "X-Scan-Training-Token": token } });
      if (res.ok) return res.json();
      if (res.status < 500 || attempt >= 4) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      // Never echo the URL or body: only the failure kind.
      if (attempt >= 4 || /^HTTP 4/.test(String(err.message))) throw new Error(`export request failed (${err.message})`);
    }
    // Render free tier may be asleep: back off and retry.
    await new Promise((r) => setTimeout(r, 15000 * attempt));
  }
}

async function main() {
  const outDir = process.argv[2];
  if (!outDir) {
    console.error("usage: fetch-scan-samples.mjs <outDir>");
    process.exit(1);
  }
  const token = process.env.SCAN_TRAINING_TOKEN;
  if (!token) {
    console.error("SCAN_TRAINING_TOKEN is required.");
    process.exit(1);
  }
  const base = (process.env.API_URL || DEFAULT_API).replace(/\/+$/, "");
  mkdirSync(outDir, { recursive: true });

  const index = [];
  let after = 0;
  for (;;) {
    const page = await getPage(base, token, after);
    const items = page.items || [];
    if (!items.length) break;
    for (const it of items) {
      const file = `${it.id}.jpg`;
      writeFileSync(join(outDir, file), Buffer.from(it.image_b64, "base64"));
      index.push({ id: it.id, file, split: it.split, card_id: it.final_id, label: it.label });
    }
    const next = page.next_after_id;
    if (next == null || next <= after) break;
    after = next;
  }
  writeFileSync(join(outDir, "index.json"), JSON.stringify(index));
  const count = (s) => index.filter((e) => e.split === s).length;
  console.log(`fetched ${index.length} crops: train=${count("train")} test=${count("test")}`);
}

main().catch((err) => {
  console.error(`fetch-scan-samples failed: ${err.message}`);
  process.exit(1);
});
