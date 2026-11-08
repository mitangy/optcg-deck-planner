"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { rewriteSource, moveInSuites } = require("./move.cjs");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "move-test-"));

test("a literal file path is rewritten wherever a suite names it (refactor 1.1)", () => {
  const src = 'const config = "backend/app/config.py";\nm({ file: "backend/app/config.py", from: "a" });\nm({ file: "backend/app/config_extra.py" });\n';
  const out = rewriteSource(src, "backend/app/config.py", "backend/app/core/config.py");
  assert.equal(out.count, 2);
  assert.equal(out.text, 'const config = "backend/app/core/config.py";\nm({ file: "backend/app/core/config.py", from: "a" });\nm({ file: "backend/app/config_extra.py" });\n');
});

test("moving a directory rewrites every path under it and not a sibling with the same prefix (refactor 1.1)", () => {
  const src = 'a("duel-web/src/nav/x.ts"); b("duel-web/src/nav"); c("duel-web/src/navigation/y.ts"); d("other/duel-web/src/nav/z.ts");\n';
  const out = rewriteSource(src, "duel-web/src/nav", "duel-web/src/shell/nav");
  assert.equal(out.text, 'a("duel-web/src/shell/nav/x.ts"); b("duel-web/src/shell/nav"); c("duel-web/src/navigation/y.ts"); d("other/duel-web/src/nav/z.ts");\n');
});

test("a template that interpolates a directory constant follows the move (refactor 1.1)", () => {
  const src = 'const src = "duel-web/src";\nf(`${src}/nav/navItems.ts`); g(`${src}/other.ts`);\n';
  const stays = rewriteSource(src, "duel-web/src/nav/navItems.ts", "duel-web/src/shell/navItems.ts");
  assert.equal(stays.text, 'const src = "duel-web/src";\nf(`${src}/shell/navItems.ts`); g(`${src}/other.ts`);\n');
  const leaves = rewriteSource(src, "duel-web/src/nav/navItems.ts", "packages/ui/src/navItems.ts");
  assert.equal(leaves.text, 'const src = "duel-web/src";\nf(`packages/ui/src/navItems.ts`); g(`${src}/other.ts`);\n');
});

test("moving the directory a constant names moves the constant and leaves its users alone (refactor 1.1)", () => {
  const src = 'const src = "duel-web/src";\nf(`${src}/nav/navItems.ts`);\n';
  const out = rewriteSource(src, "duel-web/src", "apps/duel/src");
  assert.equal(out.text, 'const src = "apps/duel/src";\nf(`${src}/nav/navItems.ts`);\n');
});

test("move.cjs rewrites a suites directory in place and prints a summary (refactor 1.1)", () => {
  const dir = tmp();
  try {
    fs.writeFileSync(path.join(dir, "one.cjs"), 'module.exports = { m: [{ file: "game-server/src/a.ts" }] };\n');
    fs.writeFileSync(path.join(dir, "two.cjs"), 'module.exports = { m: [{ file: "game-server/src/b.ts" }] };\n');
    const res = spawnSync(process.execPath, [path.join(__dirname, "move.cjs"), "game-server/src/a.ts", "game-server/src/core/a.ts", "--suites-dir", dir], { encoding: "utf8" });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /rewrote 1 reference\(s\) in suites\/one\.cjs/);
    assert.equal(fs.readFileSync(path.join(dir, "one.cjs"), "utf8"), 'module.exports = { m: [{ file: "game-server/src/core/a.ts" }] };\n');
    assert.equal(fs.readFileSync(path.join(dir, "two.cjs"), "utf8"), 'module.exports = { m: [{ file: "game-server/src/b.ts" }] };\n');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a dry run reports the rewrite without touching the suite (refactor 1.1)", () => {
  const dir = tmp();
  try {
    const text = 'x("a/b.ts");\n';
    fs.writeFileSync(path.join(dir, "s.cjs"), text);
    assert.deepEqual(moveInSuites(dir, "a/b.ts", "c/b.ts", { dryRun: true }), [{ file: "s.cjs", count: 1 }]);
    assert.equal(fs.readFileSync(path.join(dir, "s.cjs"), "utf8"), text);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
