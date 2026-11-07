#!/usr/bin/env node
/**
 * The API's TypeScript types, generated from its OpenAPI schema (refactor 2.1c, finding D-05).
 *
 *   node tools/ci/openapi-types.cjs           regenerate packages/api-client/src/generated/schema.ts
 *   node tools/ci/openapi-types.cjs --check   fail when the committed file differs from a fresh one (CI: backend job)
 *
 * The schema comes from `backend/scripts/export_openapi.py` (app.openapi() in-process: production keeps
 * /openapi.json off), the types from `openapi-typescript` (pinned in the root package.json). Python is
 * `$BACKEND_PYTHON`, else `python3`, else `python`.
 */
"use strict";

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const TARGET = path.join(ROOT, "packages", "api-client", "src", "generated", "schema.ts");
const HEADER = [
  "/**",
  " * Generated from the backend's OpenAPI schema. Do not edit.",
  " * Regenerate: node tools/ci/openapi-types.cjs (CI fails when this file is stale).",
  " */",
  "",
].join("\n");

/**
 * Compare the committed file with a fresh one. Line endings do not count (a Windows checkout may
 * convert them); the first differing line is named so the failure says where to look.
 * @returns {{ ok: true } | { ok: false, line: number, committed: string, fresh: string }}
 */
function compareGenerated(committed, fresh) {
  const a = committed.replace(/\r\n/g, "\n").split("\n");
  const b = fresh.replace(/\r\n/g, "\n").split("\n");
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return { ok: false, line: i + 1, committed: a[i] ?? "(end of file)", fresh: b[i] ?? "(end of file)" };
  }
  return { ok: true };
}

function exportSchema() {
  const candidates = [process.env.BACKEND_PYTHON, "python3", "python"].filter(Boolean);
  let lastError;
  for (const python of candidates) {
    try {
      const out = execFileSync(python, ["scripts/export_openapi.py"], {
        cwd: path.join(ROOT, "backend"),
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        stdio: ["ignore", "pipe", "inherit"],
      });
      return JSON.parse(out);
    } catch (e) {
      lastError = e;
      if (e.code !== "ENOENT") break;
    }
  }
  throw new Error(`could not run backend/scripts/export_openapi.py (is the backend installed? set BACKEND_PYTHON): ${lastError?.message}`);
}

async function generate() {
  const { default: openapiTS, astToString } = await import("openapi-typescript");
  const ast = await openapiTS(exportSchema());
  return HEADER + astToString(ast);
}

async function main() {
  const check = process.argv.includes("--check");
  const fresh = await generate();
  if (!check) {
    fs.mkdirSync(path.dirname(TARGET), { recursive: true });
    fs.writeFileSync(TARGET, fresh);
    console.log(`wrote ${path.relative(ROOT, TARGET)}`);
    return;
  }
  const committed = fs.existsSync(TARGET) ? fs.readFileSync(TARGET, "utf8") : "";
  const result = compareGenerated(committed, fresh);
  if (result.ok) {
    console.log("generated API types are up to date");
    return;
  }
  console.error(
    `${path.relative(ROOT, TARGET)} is stale (first difference at line ${result.line}):\n` +
      `  committed: ${result.committed}\n  fresh:     ${result.fresh}\n` +
      "Run `node tools/ci/openapi-types.cjs` and commit the result.",
  );
  process.exitCode = 1;
}

module.exports = { compareGenerated, TARGET };

if (require.main === module) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
