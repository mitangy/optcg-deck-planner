import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as ort from "onnxruntime-web";
import { decodeRecord } from "../src/scanner/match/descriptorCache.ts";
import { buildCandidates } from "../src/scanner/match/cardScanMatch.ts";
import { attachEmbeddings } from "../src/scanner/match/cardEmbedCache.ts";
import { createEmbedder, setScanEmbedder } from "../src/scanner/match/cardEmbed.ts";
import { DEFAULT_WALK } from "../src/scanner/match/cardScanMatch.ts";
import { queryTuning } from "../src/scanner/match/cardMatch.ts";
export { matchRectified } from "../src/scanner/match/cardScanMatch.ts";

if (process.env.CLAHE !== undefined) queryTuning.claheClip = Number(process.env.CLAHE);
if (process.env.QFEAT) queryTuning.features = Number(process.env.QFEAT);
if (process.env.WALK_MIN) DEFAULT_WALK.minExamined = Number(process.env.WALK_MIN);
if (process.env.WALK_MS) DEFAULT_WALK.maxMs = Number(process.env.WALK_MS);

export async function loadMatchAssets(desc) {
  const manifest = JSON.parse(readFileSync(join(desc, "descriptors.manifest.json"), "utf8"));
  const records = [];
  for (const chunk of manifest.chunks) {
    const file = readFileSync(join(desc, chunk.file));
    const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    for (const rec of chunk.records) records.push(decodeRecord(buf, rec.offset, rec.cardId));
  }
  const candidates = await buildCandidates(records);
  const pointerPath = join(desc, "card-embedder.json");
  if (!process.env.NOEMBED && existsSync(pointerPath)) {
    const p = JSON.parse(readFileSync(pointerPath, "utf8"));
    const emb = readFileSync(join(desc, p.embeddings.file));
    const n = attachEmbeddings(candidates, emb.buffer.slice(emb.byteOffset, emb.byteOffset + emb.byteLength));
    ort.env.wasm.numThreads = 1;
    setScanEmbedder(await createEmbedder(new Uint8Array(readFileSync(join(desc, p.model.file))), ort));
    console.log(`embedder: ${p.model.file} dim ${p.embeddings.dim}, ${n}/${candidates.length} candidates have embeddings`);
  }
  return candidates;
}
