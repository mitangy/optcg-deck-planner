#!/usr/bin/env node
/** Name a trained card-detector model by content hash and write its pointer (#701).
 *
 *   node scripts/pack-detector.mjs <model.onnx> <outDir>
 *
 * Writes `<outDir>/card-detector-<hash>.onnx` and `<outDir>/card-detector.json`
 * ({file, hash, bytes}), the two files `upload-descriptors.mjs` publishes next
 * to the descriptor chunks and `cardDetectorCache.ts` downloads. The model is
 * trained by `scripts/train-detector/` and is not committed.
 */
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [model, outDir] = process.argv.slice(2);
if (!model || !outDir) {
  console.error("usage: pack-detector.mjs <model.onnx> <outDir>");
  process.exit(1);
}
const bytes = readFileSync(model);
const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
const file = `card-detector-${hash}.onnx`;
mkdirSync(outDir, { recursive: true });
copyFileSync(model, join(outDir, file));
writeFileSync(join(outDir, "card-detector.json"), JSON.stringify({ file, hash, bytes: statSync(model).size }) + "\n");
console.log(`${join(outDir, file)} (${(bytes.length / 1048576).toFixed(2)} MB)`);
