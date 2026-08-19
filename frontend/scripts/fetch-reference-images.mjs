#!/usr/bin/env node
/** Download one reference image per catalog printing, for descriptor extraction.
 *
 * Sourced from TCGCSV (the same feed the backend catalog sync uses) rather
 * than the app's own API, so this can run without credentials and without
 * waking the API instance.
 *
 * Writes an `index.json` alongside the images in the shape
 * `extract-descriptors.mjs` expects.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CATEGORY_ID = 68;
const TCGCSV_BASE = `https://tcgcsv.com/tcgplayer/${CATEGORY_ID}`;
const UA = "OPTCGWebTracker/1.0";

/** Matches the backend sync's throttle — same feed, same courtesy. */
const REQUEST_PAUSE_MS = 120;
/** TCGPlayer's own CDN is a different host; keep concurrency modest anyway. */
const IMAGE_CONCURRENCY = 6;
const IMAGE_PAUSE_MS = 30;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

async function mapWithConcurrency(items, limit, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

async function main() {
  const outDir = process.argv[2];
  if (!outDir) {
    console.error("usage: fetch-reference-images.mjs <outDir>");
    process.exit(1);
  }
  const limit = Number(process.env.LIMIT || "") || Infinity;
  mkdirSync(outDir, { recursive: true });

  console.log("listing groups…");
  const groups = (await getJson(`${TCGCSV_BASE}/groups`)).results;
  const printings = [];
  for (const g of groups) {
    let products;
    try {
      products = (await getJson(`${TCGCSV_BASE}/${g.groupId}/products`)).results;
    } catch (err) {
      console.warn(`  skip group ${g.name}: ${err.message}`);
      continue;
    }
    await sleep(REQUEST_PAUSE_MS);
    for (const p of products) {
      const ed = Object.fromEntries(
        (p.extendedData || []).filter((e) => e.name && e.value).map((e) => [e.name, e.value]),
      );
      const cardId = (ed.Number || "").trim().toUpperCase();
      if (!cardId || !p.imageUrl) continue;
      printings.push({ cardId, productId: Number(p.productId), imageUrl: p.imageUrl });
    }
  }
  console.log(`found ${printings.length} printings across ${groups.length} groups`);

  // Interleave across sets when limiting. Taking a prefix would sample only
  // the newest set — whose art TCGPlayer often has not published yet (those
  // images 403), making a partial run look broken rather than partial.
  const bySet = new Map();
  for (const p of printings) {
    const set = p.cardId.split("-")[0];
    if (!bySet.has(set)) bySet.set(set, []);
    bySet.get(set).push(p);
  }
  const selected = [];
  const setLists = [...bySet.values()];
  for (let round = 0; selected.length < Math.min(limit, printings.length); round += 1) {
    let progressed = false;
    for (const list of setLists) {
      if (selected.length >= limit) break;
      if (round < list.length) {
        selected.push(list[round]);
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  const index = [];
  let done = 0;
  let failed = 0;
  await mapWithConcurrency(selected, IMAGE_CONCURRENCY, async (p) => {
    const label = `${p.cardId}__${p.productId}`;
    const file = `${label}.jpg`;
    const dest = join(outDir, file);
    if (!existsSync(dest)) {
      try {
        // _400w is the largest variant the CDN serves without a 403.
        const url = p.imageUrl.replace("_200w", "_400w");
        const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
        await sleep(IMAGE_PAUSE_MS);
      } catch (err) {
        failed += 1;
        console.warn(`  skip ${label}: ${err.message}`);
        return;
      }
    }
    index.push({ label, file, card_id: p.cardId });
    done += 1;
    if (done % 250 === 0) console.log(`  ${done}/${selected.length}`);
  });

  index.sort((a, b) => a.label.localeCompare(b.label));
  writeFileSync(join(outDir, "index.json"), JSON.stringify(index, null, 2));
  console.log(`wrote ${index.length} images to ${outDir} (${failed} failed)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
