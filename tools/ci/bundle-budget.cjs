/**
 * First-load size budget for the two apps (#1501). After `vite build`, reads dist/index.html, sums the gzip size of the
 * module scripts it loads up front (the entry plus its modulepreload chunks) and of its stylesheets, and fails when a
 * total is over its budget. Lazy route chunks are not counted: the budget is what a first visit downloads before
 * anything renders.
 *
 *   node tools/ci/bundle-budget.cjs duel-web frontend     (from the repo root, after the builds)
 *
 * Raise a budget only with a reason in the PR; the headroom over the current size is about 5 to 10 percent.
 */
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

// Gzip bytes. Sizes when the budgets were set: duel-web 208 KB js / 49 KB css, planner 212 KB js / 54 KB css.
const BUDGETS = {
  "duel-web": { js: 220_000, css: 54_000 },
  frontend: { js: 233_000, css: 60_000 },
};

function gzipSize(file) {
  return zlib.gzipSync(fs.readFileSync(file)).length;
}

/** The assets index.html pulls in before the app starts: module scripts, modulepreloads and stylesheets. */
function firstLoadAssets(html) {
  const js = new Set();
  const css = new Set();
  for (const tag of html.match(/<(?:script|link)\b[^>]*>/g) ?? []) {
    const attr = (name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
    const url = attr("src") ?? attr("href");
    if (!url || !url.startsWith("/assets/")) continue;
    if (tag.startsWith("<script") && attr("type") === "module") js.add(url);
    else if (attr("rel") === "modulepreload") js.add(url);
    else if (attr("rel") === "stylesheet") css.add(url);
  }
  return { js: [...js], css: [...css] };
}

/** Returns { app, js, css, failures }; sizes are gzip bytes. `budgets` defaults to BUDGETS[app]. */
function checkApp(app, distDir, budgets = BUDGETS[app]) {
  const html = fs.readFileSync(path.join(distDir, "index.html"), "utf8");
  const assets = firstLoadAssets(html);
  const size = (urls) => urls.reduce((sum, u) => sum + gzipSize(path.join(distDir, u)), 0);
  const result = { app, js: size(assets.js), css: size(assets.css), failures: [] };
  if (assets.js.length === 0) result.failures.push(`${app}: no module script found in ${distDir}/index.html`);
  for (const kind of ["js", "css"]) {
    if (result[kind] > budgets[kind]) {
      result.failures.push(`${app}: first-load ${kind} is ${(result[kind] / 1000).toFixed(1)} KB gzip, over its ${(budgets[kind] / 1000).toFixed(0)} KB budget`);
    }
  }
  return result;
}

function main(argv) {
  const apps = argv.length ? argv : Object.keys(BUDGETS);
  const repo = path.resolve(__dirname, "../..");
  let failed = false;
  for (const app of apps) {
    if (!BUDGETS[app]) {
      console.error(`unknown app "${app}" (expected ${Object.keys(BUDGETS).join(" or ")})`);
      process.exit(2);
    }
    const r = checkApp(app, path.join(repo, app, "dist"));
    console.log(`${app}: first-load js ${(r.js / 1000).toFixed(1)} KB gzip (budget ${BUDGETS[app].js / 1000}), css ${(r.css / 1000).toFixed(1)} KB gzip (budget ${BUDGETS[app].css / 1000})`);
    for (const f of r.failures) console.error(`FAIL ${f}`);
    if (r.failures.length) failed = true;
  }
  process.exit(failed ? 1 : 0);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { BUDGETS, checkApp, firstLoadAssets };
