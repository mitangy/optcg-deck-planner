"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { locateStale } = require("./locate.cjs");

const suite = (cwd, ...mutations) => ({ cwd, mutations });
const m = (id, file, from) => ({ id, file, from, to: "x", kills: ["t"] });
function run(sources, suites, extra = {}) {
  return locateStale({ repo: "/nowhere", suites, files: Object.keys(sources), readFile: (f) => sources[f], ...extra });
}

test("a stale anchor is located in the file the code moved to (refactor 1.1)", () => {
  const out = run(
    { "app/new/util.ts": "export const a = 1;\nexport function go() {\n  return 2;\n}\n", "app/other.ts": "nothing here\n" },
    { demo: suite("app", m("go-returns-2", "app/old/util.ts", "export function go() {\n  return 2;\n}")) },
  );
  assert.deepEqual(out.output, ["demo go-returns-2: app/old/util.ts -> app/new/util.ts"]);
  assert.equal(out.unlocated, 0);
});

test("a moved and re-indented anchor is located through the whitespace fallback (refactor 1.1)", () => {
  const out = run(
    { "app/new/util.ts": "class K {\n    go() {\n        return 2;\n    }\n}\n" },
    { demo: suite("app", m("go-returns-2", "app/old/util.ts", "go() {\n  return 2;\n}")) },
  );
  assert.deepEqual(out.output, ["demo go-returns-2: app/old/util.ts -> app/new/util.ts"]);
});

test("an anchor found in two files is ambiguous and counts as unlocated (refactor 1.1)", () => {
  const out = run(
    { "app/a.ts": "return 2;\n", "app/b.ts": "return 2;\n" },
    { demo: suite("app", m("r2", "app/old.ts", "return 2;")) },
  );
  assert.deepEqual(out.output, ["demo r2: app/old.ts -> ambiguous: 2 files"]);
  assert.equal(out.unlocated, 1);
});

test("an anchor that exists nowhere is reported as not found (refactor 1.1)", () => {
  const out = run({ "app/a.ts": "x\n" }, { demo: suite("app", m("gone", "app/old.ts", "return 2;")) });
  assert.deepEqual(out.output, ["demo gone: app/old.ts -> not found"]);
  assert.equal(out.unlocated, 1);
});

test("the search stays inside the suite's directory unless a scope is given (refactor 1.1)", () => {
  const sources = { "elsewhere/a.ts": "return 2;\n", "app/b.ts": "other\n" };
  const suites = { demo: suite("app", m("r2", "app/old.ts", "return 2;")) };
  assert.deepEqual(run(sources, suites).output, ["demo r2: app/old.ts -> not found"]);
  assert.deepEqual(run(sources, suites, { scope: "elsewhere" }).output, ["demo r2: app/old.ts -> elsewhere/a.ts"]);
});

test("an anchor that still matches once in its own file is not reported (refactor 1.1)", () => {
  const out = run({ "app/old.ts": "return 2;\n", "app/b.ts": "return 2;\n" }, { demo: suite("app", m("fine", "app/old.ts", "return 2;")) });
  assert.deepEqual(out, { output: [], stale: 0, unlocated: 0 });
});
