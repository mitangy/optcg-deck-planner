/**
 * --locate-stale: for each mutation anchor that no longer matches its file,
 * search the tracked source files for the one place the anchor moved to.
 * Exact text is tried across all candidate files first, then the
 * whitespace-tolerant fallback. Read-only.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { findAnchor } = require("./anchors.cjs");

const SKIP_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|ico|webm|mp4|mov|woff2?|ttf|otf|pdf|zip|gz|db|sqlite3?|onnx|bin|lock)$/i;
const MAX_BYTES = 2 * 1024 * 1024;
const SUITES_PREFIX = "tools/mutation-check/suites/";

function trackedFiles(repo) {
  return execFileSync("git", ["ls-files", "-z"], { cwd: repo, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }).split("\0").filter(Boolean);
}

/** Directories to search for an anchor whose old file was `oldFile` in a suite running in `cwd`. */
function defaultScopes(cwd, oldFile) {
  const parts = oldFile.split("/");
  // The file's own package/app root: packages/<name>, else the first directory.
  const root = parts[0] === "packages" && parts.length > 2 ? parts.slice(0, 2).join("/") : parts.length > 1 ? parts[0] : "";
  return [...new Set([cwd === "." ? "" : cwd, root])];
}

const inScope = (file, scopes) => scopes.some((s) => s === "" || s === "." || file === s || file.startsWith(`${s.replace(/\/$/, "")}/`));

/**
 * Locate every stale anchor. `scope` (a repo-relative directory) replaces the
 * default search area. `files` and `readFile` can be injected for tests.
 * Returns { output: string[], stale, unlocated }.
 */
function locateStale({ repo, suites, only = null, scope = null, files = null, readFile = null }) {
  const list = files ?? trackedFiles(repo);
  const read = readFile ?? ((f) => {
    const abs = path.join(repo, f);
    if (SKIP_EXT.test(f) || fs.statSync(abs).size > MAX_BYTES) return null;
    return fs.readFileSync(abs, "utf8");
  });
  const cache = new Map();
  const text = (f) => {
    if (!cache.has(f)) { let t = null; try { t = read(f) ?? null; } catch {} cache.set(f, t); }
    return cache.get(f);
  };
  const output = [];
  let stale = 0;
  let unlocated = 0;
  for (const [name, suite] of Object.entries(suites)) {
    for (const mutation of suite.mutations) {
      if (only && !only.test(mutation.id)) continue;
      const edits = mutation.edits ?? (mutation.json ? [{ json: mutation.json }] : [{ file: mutation.file, from: mutation.from }]);
      for (const edit of edits) {
        if (edit.json) continue;
        const own = text(edit.file);
        if (own !== null && findAnchor(own, edit.from).count > 0) {
          if (findAnchor(own, edit.from).count === 1) continue;
          stale += 1; unlocated += 1;
          output.push(`${name} ${mutation.id}: ${edit.file} -> ambiguous: matches ${findAnchor(own, edit.from).count} times in place`);
          continue;
        }
        stale += 1;
        const scopes = scope ? [scope] : defaultScopes(suite.cwd ?? ".", edit.file);
        // The suites quote every anchor, so they would always match themselves.
        const candidates = list.filter((f) => f !== edit.file && !f.startsWith(SUITES_PREFIX) && inScope(f, scopes));
        let hits = [];
        for (const mode of ["exact", "loose"]) {
          hits = [];
          for (const f of candidates) {
            const t = text(f);
            if (t === null) continue;
            const found = findAnchor(t, edit.from);
            if (found.count > 0 && (mode === "loose" || found.mode === "exact")) hits.push({ f, count: found.count });
          }
          if (hits.length) break;
        }
        if (hits.length === 1 && hits[0].count === 1) output.push(`${name} ${mutation.id}: ${edit.file} -> ${hits[0].f}`);
        else {
          unlocated += 1;
          if (!hits.length) output.push(`${name} ${mutation.id}: ${edit.file} -> not found`);
          else if (hits.length === 1) output.push(`${name} ${mutation.id}: ${edit.file} -> ambiguous: ${hits[0].f} matches ${hits[0].count} times`);
          else output.push(`${name} ${mutation.id}: ${edit.file} -> ambiguous: ${hits.length} files`);
        }
      }
    }
  }
  return { output, stale, unlocated };
}

module.exports = { locateStale, defaultScopes };
