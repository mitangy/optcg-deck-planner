#!/usr/bin/env node
/**
 * Keeps the stylesheets on the shared z-index scale (refactor 4.1a).
 *
 *   node tools/ci/css-tokens.cjs
 *
 * Every layer lives in packages/ui/src/tokens.css as a `--z-*` custom property. A stylesheet that writes
 * `z-index: 42` instead of `var(--z-...)` puts a layer outside the scale again, and the next stacking bug
 * is found by trial and error. `z-index: auto` and `var(...)` are fine; so is a number in a comment.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const TOKENS = "packages/ui/src/tokens.css";
/** Where the app and package stylesheets live. */
const CSS_ROOTS = ["frontend/src", "duel-web/src", "packages"];

/** Replaces comments with blank text of the same length, so line numbers stay right. */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
}

/** @param {string} css @returns {{ line: number, text: string }[]} declarations with a raw number */
function findRawZIndex(css) {
  const out = [];
  stripComments(css)
    .split("\n")
    .forEach((text, i) => {
      if (/(^|[\s{;])z-index:\s*-?\d/.test(text)) out.push({ line: i + 1, text: text.trim() });
    });
  return out;
}

/** @param {string} css @returns {string[]} the `--z-*` names the stylesheet reads through var() */
function usedZTokens(css) {
  return [...stripComments(css).matchAll(/var\(\s*(--z-[a-z0-9-]+)/g)].map((m) => m[1]);
}

/** @param {string} css @returns {string[]} the `--z-*` names the stylesheet defines */
function definedZTokens(css) {
  return [...stripComments(css).matchAll(/(?:^|[\s{;])(--z-[a-z0-9-]+)\s*:/g)].map((m) => m[1]);
}

/** @returns {string[]} repo-relative paths of every app and package stylesheet */
function stylesheets() {
  const found = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === "dist") continue;
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith(".css")) found.push(rel);
    }
  };
  for (const r of CSS_ROOTS) walk(r);
  return found.sort();
}

module.exports = { TOKENS, ROOT, findRawZIndex, usedZTokens, definedZTokens, stylesheets };

if (require.main === module) {
  let bad = 0;
  const defined = new Set(definedZTokens(fs.readFileSync(path.join(ROOT, TOKENS), "utf8")));
  for (const f of stylesheets()) {
    const css = fs.readFileSync(path.join(ROOT, f), "utf8");
    if (f !== TOKENS) {
      for (const { line, text } of findRawZIndex(css)) {
        console.error(`${f}:${line}: raw z-index (${text}); use a --z-* token from ${TOKENS}`);
        bad++;
      }
    }
    for (const t of new Set(usedZTokens(css))) {
      if (!defined.has(t)) {
        console.error(`${f}: ${t} is not defined in ${TOKENS}`);
        bad++;
      }
    }
  }
  if (bad) process.exit(1);
}
