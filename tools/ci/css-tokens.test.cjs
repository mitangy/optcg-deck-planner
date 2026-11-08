"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT, TOKENS, findRawZIndex, usedZTokens, definedZTokens, stylesheets } = require("./css-tokens.cjs");

test("a raw z-index number is flagged, a token, auto or a comment is not (refactor 4.1a)", () => {
  const css = [
    ".a { z-index: 17; }",
    ".b { z-index: var(--z-dock); }",
    ".c { z-index: auto; }",
    "/* the dock sits at z-index: 17 */",
    ".d {\n  position: fixed;\n  z-index: -1;\n}",
    ".e { z-index: calc(var(--lp-z-panel, var(--z-lp-panel)) + 10); }",
  ].join("\n");
  assert.deepEqual(
    findRawZIndex(css).map((f) => f.line),
    [1, 7],
  );
});

test("no app or package stylesheet writes a raw z-index number outside tokens.css (refactor 4.1a)", () => {
  const offenders = [];
  for (const f of stylesheets()) {
    if (f === TOKENS) continue;
    for (const { line, text } of findRawZIndex(fs.readFileSync(path.join(ROOT, f), "utf8"))) offenders.push(`${f}:${line} ${text}`);
  }
  assert.deepEqual(offenders, []);
});

test("every --z-* token a stylesheet reads is defined in tokens.css (refactor 4.1a)", () => {
  const defined = new Set(definedZTokens(fs.readFileSync(path.join(ROOT, TOKENS), "utf8")));
  assert.ok(defined.size > 20, "tokens.css defines the scale");
  const missing = [];
  for (const f of stylesheets()) {
    for (const t of new Set(usedZTokens(fs.readFileSync(path.join(ROOT, f), "utf8")))) if (!defined.has(t)) missing.push(`${f} ${t}`);
  }
  assert.deepEqual(missing, []);
});
