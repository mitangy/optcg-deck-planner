"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { applyAnchor, findAnchor } = require("./anchors.cjs");

test("an exact anchor still applies as before (refactor 1.1)", () => {
  const out = applyAnchor("a();\nb();\n", "b();\n", "c();\n");
  assert.deepEqual(out, { updated: "a();\nc();\n", mode: "exact" });
});

test("a re-indented, re-wrapped anchor applies through the whitespace fallback (refactor 1.1)", () => {
  const source = "function f() {\n    if (ready &&\n        ok) {\n      go();\n    }\n}\n";
  const from = "  if (ready && ok) {\n    go();\n  }\n";
  const out = applyAnchor(source, from, "  if (ready && ok) {\n    stop();\n  }\n");
  assert.equal(out.mode, "loose");
  assert.equal(out.updated, "function f() {\n    if (ready && ok) {\n    stop();\n  }\n}\n");
});

test("the fallback does not double the indentation or newline that from and to share (refactor 1.1)", () => {
  const out = applyAnchor("    x = 1;\n    y = 2;\n", "  x = 1;\n  y = 2;\n", "  x = 9;\n  y = 2;\n");
  assert.equal(out.mode, "loose");
  assert.equal(out.updated, "    x = 9;\n  y = 2;\n");
});

test("an anchor matching twice only after whitespace folding is stale (refactor 1.1)", () => {
  const source = "go(a,\n   b);\nlater();\ngo(a,   b);\n";
  const out = applyAnchor(source, "go(a, b);", "stop();");
  assert.deepEqual(out, { error: true, count: 2 });
});

test("an exact match wins even when a reformatted copy exists (refactor 1.1)", () => {
  const source = "go(a, b);\ngo(a,\n  b);\n";
  const out = applyAnchor(source, "go(a, b);", "stop();");
  assert.equal(out.mode, "exact");
  assert.equal(out.updated, "stop();\ngo(a,\n  b);\n");
});

test("the fallback never adds or removes whitespace next to punctuation (refactor 1.1)", () => {
  assert.equal(findAnchor("go( a, b )", "go(a, b)").count, 0);
  assert.equal(findAnchor("go(a,b)", "go(a, b)").count, 0);
});

test("a CRLF source still matches an LF anchor exactly (refactor 1.1)", () => {
  const out = applyAnchor("a\r\nb\r\n", "a\nb\n", "c\n");
  assert.deepEqual(out, { updated: "c\r\n", mode: "exact" });
});
