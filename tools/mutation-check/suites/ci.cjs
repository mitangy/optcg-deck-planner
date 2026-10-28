/** CI path-filter mutations: each mapping in tools/ci/changes.cjs, plus its safe fallbacks. */
const f = "tools/ci/changes.cjs";
const m = (id, from, to, kills) => ({ id, file: f, from, to, kills });
module.exports = {
  cwd: ".",
  runner: "node-test",
  args: '"tools/ci/*.test.cjs"',
  mutations: [
    m("ci-duel-web-skips-e2e", 'p.startsWith("duel-web/"), flags: ["duel_web", "duel_e2e"]', 'p.startsWith("duel-web/"), flags: ["duel_web"]', ["a duel-web change runs the duel-web unit and e2e jobs only"]),
    m("ci-backend-runs-e2e", 'p.startsWith("scripts/"), flags: ["backend"]', 'p.startsWith("scripts/"), flags: ["backend", "duel_e2e"]', ["a backend-only change leaves the duel e2e shards off"]),
    m("ci-packages-skips-duel-web", 'p.startsWith("packages/"), flags: ["rules", "duel_web", "duel_e2e", "frontend"]', 'p.startsWith("packages/"), flags: ["rules", "duel_e2e", "frontend"]', ["a packages change runs duel-web"]),
    m("ci-fixtures-skip-mobile", 'flags: ["rules", "duel_web", "duel_e2e", "frontend", "mobile"]', 'flags: ["rules", "duel_web", "duel_e2e", "frontend"]', ["protocol fixtures also run the mobile tests"]),
    m("ci-game-server-skips-e2e", 'p.startsWith("game-server/"), flags: ["rules", "duel_e2e"]', 'p.startsWith("game-server/"), flags: ["rules"]', ["game-server changes run the rules job and the duel e2e shards"]),
    m("ci-ticket-vector-skips-rules", 'p.startsWith("backend/tests/fixtures/"), flags: ["backend", "rules"]', 'p.startsWith("backend/tests/fixtures/"), flags: ["backend"]', ["the ticket vector shared with game-server"]),
    m("ci-analyst-skips-rules", 'p.startsWith("analyst/"), flags: ["rules"]', 'p.startsWith("analyst/"), flags: []', ["analyst, scripts, frontend and mobile each run their own job"]),
    m("ci-frontend-skips-frontend", 'p.startsWith("frontend/"), flags: ["frontend"]', 'p.startsWith("frontend/"), flags: []', ["analyst, scripts, frontend and mobile each run their own job"]),
    m("ci-mobile-skips-mobile", 'p.startsWith("mobile/"), flags: ["mobile"]', 'p.startsWith("mobile/"), flags: []', ["analyst, scripts, frontend and mobile each run their own job"]),
    m("ci-scripts-skip-backend", 'p.startsWith("backend/") || p.startsWith("scripts/"), flags: ["backend"]', 'p.startsWith("backend/"), flags: ["backend"] },\n  { test: (p) => p.startsWith("scripts/"), flags: []', ["analyst, scripts, frontend and mobile each run their own job"]),
    m("ci-mutation-check-skips-rules", 'p.startsWith("tools/mutation-check/"), flags: ["rules"]', 'p.startsWith("tools/mutation-check/"), flags: []', ["analyst, scripts, frontend and mobile each run their own job"]),
    m("ci-unknown-path-runs-nothing", "for (const f of rule ? rule.flags : FLAGS) on.add(f);", "for (const f of rule ? rule.flags : []) on.add(f);", ["a path outside every known area turns every job on"]),
    m("ci-dotdot-path-trusted", 'const rule = p.split("/").includes("..") ? null : RULES.find((r) => r.test(p));', "const rule = RULES.find((r) => r.test(p));", ["a path outside every known area turns every job on"]),
    m("ci-docs-run-rules", 'p.startsWith("docs/"), flags: []', 'p.startsWith("docs/"), flags: ["rules"]', ["docs and root markdown files turn nothing on"]),
    m("ci-nested-markdown-exempt", "/^[^/]+\\.md$/.test(p)", "/\\.md$/.test(p)", ["markdown below the root is not exempt"]),
    m("ci-workflow-change-runs-nothing", 'p === ".github/workflows/ci.yml", flags: FLAGS', 'p === ".github/workflows/ci.yml", flags: []', ["the workflow, root manifests and tools/ci turn every job on"]),
    m("ci-root-manifest-runs-nothing", 'p === "package.json" || p === "package-lock.json", flags: FLAGS', 'p === "package.json" || p === "package-lock.json", flags: []', ["the workflow, root manifests and tools/ci turn every job on"]),
    m("ci-tools-ci-runs-nothing", 'p.startsWith("tools/ci/"), flags: FLAGS', 'p.startsWith("tools/ci/"), flags: []', ["the workflow, root manifests and tools/ci turn every job on"]),
    m("ci-other-workflows-run-all", 'p.startsWith(".github/"), flags: []', 'p.startsWith(".github/"), flags: FLAGS', ["other workflows do not trigger the app jobs"]),
    m("ci-flags-not-unioned", "for (const f of rule ? rule.flags : FLAGS) on.add(f);", "on.clear(); for (const f of rule ? rule.flags : FLAGS) on.add(f);", ["flags union across paths"]),
    m("ci-empty-diff-runs-nothing", "if (!list.length) return Object.fromEntries(FLAGS.map((f) => [f, true]));", "if (!list.length) return Object.fromEntries(FLAGS.map((f) => [f, false]));", ["an empty path list runs everything"]),
    ...[
      ["ci-media-drops-video", "png|jpe?g|gif|webp|avif|bmp|webm|mp4|mov", "png|jpe?g|gif|webp|avif|bmp", "a webm and an mp4 recording outside app media folders are blocked"],
      ["ci-media-case-sensitive", "|mov)$/i;", "|mov)$/;", "an uppercase extension is still blocked"],
      ["ci-media-allows-all", "  return paths\n", "  return [];\n  return paths\n", "a PNG under docs/pr-shots is blocked"],
      ["ci-media-no-snapshots", ' || dir.endsWith("-snapshots")', "", "card art, app assets and Playwright baselines are allowed"],
      ["ci-media-no-assets", 'dir === "public" || dir === "assets"', 'dir === "public"', "card art, app assets and Playwright baselines are allowed"],
    ].map(([id, from, to, kill]) => ({ id, file: "tools/ci/pr-media.cjs", from, to, kills: [kill] })),
  ],
};
