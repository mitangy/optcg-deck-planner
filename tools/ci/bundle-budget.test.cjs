const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { checkApp, firstLoadAssets } = require("./bundle-budget.cjs");

/** Random bytes do not compress, so a file of n bytes is about n bytes gzipped. */
function dist(files, html) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "budget-"));
  fs.mkdirSync(path.join(dir, "assets"));
  for (const [name, bytes] of Object.entries(files)) fs.writeFileSync(path.join(dir, "assets", name), crypto.randomBytes(bytes));
  fs.writeFileSync(path.join(dir, "index.html"), html);
  return dir;
}

const PAGE = (head) => `<!doctype html><html><head>${head}</head><body><div id="root"></div></body></html>`;
const ENTRY = '<script type="module" crossorigin src="/assets/index-a.js"></script><link rel="stylesheet" crossorigin href="/assets/index-a.css">';

test("a first load under both budgets passes (#1501)", () => {
  const dir = dist({ "index-a.js": 2000, "index-a.css": 1000 }, PAGE(ENTRY));
  const r = checkApp("x", dir, { js: 3000, css: 2000 });
  assert.deepEqual(r.failures, []);
});

test("an entry script over the js budget fails (#1501)", () => {
  const dir = dist({ "index-a.js": 5000, "index-a.css": 1000 }, PAGE(ENTRY));
  const r = checkApp("x", dir, { js: 3000, css: 2000 });
  assert.equal(r.failures.length, 1);
  assert.match(r.failures[0], /first-load js/);
});

test("a stylesheet over the css budget fails (#1501)", () => {
  const dir = dist({ "index-a.js": 2000, "index-a.css": 5000 }, PAGE(ENTRY));
  const r = checkApp("x", dir, { js: 3000, css: 2000 });
  assert.equal(r.failures.length, 1);
  assert.match(r.failures[0], /first-load css/);
});

test("modulepreload chunks count toward the js budget, lazy chunks do not (#1501)", () => {
  const head = `${ENTRY}<link rel="modulepreload" crossorigin href="/assets/shared-b.js">`;
  const dir = dist({ "index-a.js": 2000, "shared-b.js": 2000, "index-a.css": 500, "Lazy-c.js": 9000 }, PAGE(head));
  const r = checkApp("x", dir, { js: 3000, css: 2000 });
  assert.equal(r.failures.length, 1, "entry plus the preloaded chunk are over 3000");
  assert.ok(r.js > 3500 && r.js < 4500, `counted ${r.js} bytes, not the 9000 byte lazy chunk`);
});

test("a page with no module script fails instead of passing with zero bytes (#1501)", () => {
  const dir = dist({}, PAGE(""));
  assert.equal(checkApp("x", dir, { js: 3000, css: 2000 }).failures.length, 1);
});

test("firstLoadAssets reads only /assets urls and separates scripts from styles (#1501)", () => {
  const a = firstLoadAssets(PAGE('<script type="module" src="/assets/i.js"></script><script src="/assets/classic.js"></script><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/assets/s.css"><link rel="stylesheet" href="https://fonts.googleapis.com/css2">'));
  assert.deepEqual(a, { js: ["/assets/i.js"], css: ["/assets/s.css"] });
});
