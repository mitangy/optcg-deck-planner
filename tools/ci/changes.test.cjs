"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { classify, FLAGS } = require("./changes.cjs");

const on = (paths) => FLAGS.filter((f) => classify(paths)[f]).sort();
const ALL = [...FLAGS].sort();

test("a duel-web change runs the duel-web unit and e2e jobs only (#739)", () => {
  assert.deepEqual(on(["duel-web/src/board/DuelBoard.tsx"]), ["duel_e2e", "duel_web"]);
});

test("a backend-only change leaves the duel e2e shards off (#739)", () => {
  const flags = classify(["backend/app/routers/duel.py", "backend/tests/test_duel.py"]);
  assert.equal(flags.duel_e2e, false);
  assert.equal(flags.backend, true);
  assert.deepEqual(on(["backend/app/main.py"]), ["backend"]);
});

test("a packages change runs duel-web, its e2e, the planner and the rules job (#739)", () => {
  assert.deepEqual(on(["packages/ui/src/index.ts"]), ["duel_e2e", "duel_web", "frontend", "rules"]);
});

test("protocol fixtures also run the mobile tests that read them (#739)", () => {
  assert.equal(classify(["packages/rules/protocol-fixtures/x.json"]).mobile, true);
  assert.equal(classify(["packages/rules/src/engine/views.ts"]).mobile, false);
});

test("the golden deck lists also run the backend tests that read them", () => {
  assert.equal(classify(["packages/card-core/fixtures/decklists.json"]).backend, true);
  assert.equal(classify(["packages/card-core/src/decklist.ts"]).backend, false);
});

test("game-server changes run the rules job and the duel e2e shards (#739)", () => {
  assert.deepEqual(on(["game-server/src/app.config.ts"]), ["duel_e2e", "rules"]);
});

test("the ticket vector shared with game-server runs the rules job too (#739)", () => {
  assert.deepEqual(on(["backend/tests/fixtures/brief_ticket_vector.json"]), ["backend", "rules"]);
});

test("analyst, scripts, frontend and mobile each run their own job (#739)", () => {
  assert.deepEqual(on(["analyst/src/chat.ts"]), ["rules"]);
  assert.deepEqual(on(["scripts/sync_alt_arts.py"]), ["backend"]);
  assert.deepEqual(on(["frontend/src/App.tsx"]), ["frontend"]);
  assert.deepEqual(on(["mobile/src/config.ts"]), ["mobile"]);
  assert.deepEqual(on(["tools/mutation-check/suites/rules.cjs"]), ["rules"]);
});

test("a path outside every known area turns every job on (#739)", () => {
  assert.deepEqual(on(["some-new-dir/file.ts"]), ALL);
  assert.deepEqual(on([".gitignore"]), ALL);
  assert.deepEqual(on(["docs/a.md", "render.yaml"]), ALL);
  assert.deepEqual(on(["docs/a.md", "frontend/../backend/x.py"]), ALL);
  assert.deepEqual(on(["docs/sub/../../packages/x.ts"]), ALL);
});

test("docs and root markdown files turn nothing on (#739)", () => {
  assert.deepEqual(on(["docs/duel-client/README.md", "README.md", "CLAUDE.md", "AGENTS.md"]), []);
});

test("markdown below the root is not exempt (#739)", () => {
  assert.deepEqual(on(["packages/ui/README.md"]), ["duel_e2e", "duel_web", "frontend", "rules"]);
  assert.deepEqual(on(["unknown/NOTES.md"]), ALL);
});

test("the workflow, root manifests and tools/ci turn every job on (#739)", () => {
  assert.deepEqual(on([".github/workflows/ci.yml"]), ALL);
  assert.deepEqual(on(["package.json"]), ALL);
  assert.deepEqual(on(["package-lock.json"]), ALL);
  assert.deepEqual(on(["tools/ci/changes.cjs"]), ALL);
});

test("the Node version file and the composite setup actions turn every job on (refactor 1.4)", () => {
  assert.deepEqual(on([".nvmrc"]), ALL);
  assert.deepEqual(on([".github/actions/setup-node-deps/action.yml"]), ALL);
  assert.deepEqual(on([".github/actions/pr-base/action.yml"]), ALL);
});

test("root lint and compiler config run the lint and typecheck jobs; ruff.toml only the backend; .editorconfig none (refactor 1.3)", () => {
  assert.deepEqual(on(["eslint.config.js"]), ALL);
  assert.deepEqual(on(["tsconfig.base.json"]), ALL);
  assert.deepEqual(on(["tsconfig.web.json"]), ALL);
  assert.deepEqual(on(["ruff.toml"]), ["backend"]);
  assert.deepEqual(on([".editorconfig"]), []);
});

test("an app manifest feeds the root lock, so every JS job reruns; other app files do not (refactor 1.2)", () => {
  assert.deepEqual(on(["frontend/package.json"]), ["duel_e2e", "duel_web", "frontend", "rules"]);
  assert.deepEqual(on(["duel-web/package.json"]), ["duel_e2e", "duel_web", "frontend", "rules"]);
  assert.deepEqual(on(["frontend/src/App.tsx"]), ["frontend"]);
});

test("other workflows do not trigger the app jobs, and flags union across paths (#739)", () => {
  assert.deepEqual(on([".github/workflows/nightly.yml"]), []);
  assert.deepEqual(on(["mobile/src/a.ts", "backend/app/main.py"]), ["backend", "mobile"]);
});

test("an empty path list runs everything (#739)", () => {
  assert.deepEqual(on([]), ALL);
});

test("prerender and vercel-ignore scripts run the apps that import or read them, not the backend (refactor 0.1)", () => {
  assert.deepEqual(on(["scripts/seo/prerender-plugin.mjs"]), ["duel_e2e", "duel_web", "frontend"]);
  assert.deepEqual(on(["scripts/seo/vercel-routes.mjs"]), ["duel_e2e", "duel_web", "frontend"]);
  assert.deepEqual(on(["scripts/vercel-ignore-build.sh"]), ["duel_e2e", "duel_web", "frontend"]);
});

test("the shared vite plugins run the apps that import them, not the backend (refactor 2.3)", () => {
  assert.deepEqual(on(["tools/vite/versionFile.mjs"]), ["duel_e2e", "duel_web", "frontend"]);
});
