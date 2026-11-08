import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const config = (rel: string) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8")) as { ignoreCommand: string };

// Vercel rejects a vercel.json whose ignoreCommand is over 256 characters, and then nothing deploys (#956).
describe("vercel ignoreCommand (#956)", () => {
  it.each([
    ["planner", "../../../vercel.json"],
    ["duel-web", "../../../duel-web/vercel.json"],
  ])("the %s ignoreCommand fits Vercel's 256-character limit (#956)", (_app, rel) => {
    expect(config(rel).ignoreCommand.length).toBeLessThanOrEqual(256);
  });

  it("a planner build still runs when the card text the card page shows changes (#956)", () => {
    const paths = config("../../../vercel.json").ignoreCommand.split(/\s+/).slice(2);
    expect(paths.some((p) => "packages/rules/src/cards/cardData.json".startsWith(p))).toBe(true);
  });
});

// Both apps import packages/card-core, but listing it would push the planner's ignoreCommand past 256 characters,
// so the script itself always watches it (like the root lockfile).
describe("tools/vercel-ignore-build.sh watches packages/card-core for every app (#956)", () => {
  const script = join(dirname(fileURLToPath(import.meta.url)), "../../../tools/vercel-ignore-build.sh");

  /** Commits `file` twice in a scratch repo and returns the script's exit code for `frontend` (1 = build, 0 = skip). */
  function exitCodeAfterChange(file: string): number {
    const dir = mkdtempSync(join(tmpdir(), "vercel-ignore-"));
    try {
      const run = (cmd: string, args: string[], env: Record<string, string> = {}) =>
        spawnSync(cmd, args, { cwd: dir, encoding: "utf8", env: { ...process.env, ...env } });
      const vcs = (...args: string[]) => run("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args]);
      vcs("init", "-q");
      mkdirSync(join(dir, dirname(file)), { recursive: true });
      writeFileSync(join(dir, file), "1");
      vcs("add", "-A");
      vcs("commit", "-qm", "before");
      const prev = vcs("rev-parse", "HEAD").stdout.trim();
      writeFileSync(join(dir, file), "2");
      vcs("commit", "-qam", "after");
      return run("bash", [script, "frontend"], { VERCEL_ENV: "production", VERCEL_GIT_PREVIOUS_SHA: prev }).status ?? -1;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("builds when a card-core file changes and skips when only an unrelated path changes (#956)", () => {
    expect(exitCodeAfterChange("packages/card-core/src/cardId.ts")).toBe(1);
    expect(exitCodeAfterChange("backend/app/main.py")).toBe(0);
  });

  it("builds when the shared vite version-file plugin changes (refactor 2.3)", () => {
    expect(exitCodeAfterChange("tools/vite/versionFile.mjs")).toBe(1);
  });

  it("builds when the shared HTTP client changes (refactor 2.1b)", () => {
    expect(exitCodeAfterChange("packages/api-client/src/request.ts")).toBe(1);
  });
});

// A package an app bundles, directly or through another package, must trigger that app's production build when it
// changes. analyst-contract was missed because duel-web only reaches it through analyst-client (#1101).
describe("every workspace package an app bundles triggers its build (#1101)", () => {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
  const script = join(repoRoot, "tools/vercel-ignore-build.sh");
  const manifest = (dir: string) =>
    JSON.parse(readFileSync(join(repoRoot, dir, "package.json"), "utf8")) as Record<string, Record<string, string> | string>;

  const dirByName = new Map<string, string>();
  for (const d of readdirSync(join(repoRoot, "packages"), { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    dirByName.set(manifest(`packages/${d.name}`).name as string, `packages/${d.name}`);
  }

  /** The directories of the @optcg/* packages `appDir` depends on, directly or transitively. */
  function workspaceDeps(appDir: string): string[] {
    const seen = new Set<string>();
    const visit = (dir: string) => {
      const pkg = manifest(dir);
      const names = Object.keys({ ...(pkg.dependencies as object), ...(pkg.devDependencies as object) });
      for (const name of names) {
        const depDir = dirByName.get(name);
        if (depDir && !seen.has(depDir)) {
          seen.add(depDir);
          visit(depDir);
        }
      }
    };
    visit(appDir);
    return [...seen].sort();
  }

  /** Commits `file` twice in a scratch repo and returns the script's exit code when run with the given args. */
  function exitCode(args: string[], file: string): number {
    const dir = mkdtempSync(join(tmpdir(), "vercel-ignore-"));
    try {
      const run = (cmd: string, a: string[], env: Record<string, string> = {}) =>
        spawnSync(cmd, a, { cwd: dir, encoding: "utf8", env: { ...process.env, ...env } });
      const vcs = (...a: string[]) => run("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a]);
      vcs("init", "-q");
      mkdirSync(join(dir, dirname(file)), { recursive: true });
      writeFileSync(join(dir, file), "1");
      vcs("add", "-A");
      vcs("commit", "-qm", "before");
      const prev = vcs("rev-parse", "HEAD").stdout.trim();
      writeFileSync(join(dir, file), "2");
      vcs("commit", "-qam", "after");
      return run("bash", [script, ...args], { VERCEL_ENV: "production", VERCEL_GIT_PREVIOUS_SHA: prev }).status ?? -1;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it.each([
    ["planner", "frontend", "vercel.json"],
    ["duel-web", "duel-web", "duel-web/vercel.json"],
  ])("a change in any package the %s bundles makes its ignoreCommand build (#1101)", (_app, appDir, vercelJson) => {
    const { ignoreCommand } = JSON.parse(readFileSync(join(repoRoot, vercelJson), "utf8")) as { ignoreCommand: string };
    // "bash [../]tools/vercel-ignore-build.sh <app> <paths...>": the script gets everything after its own name.
    const args = ignoreCommand.split(/\s+/).slice(2);
    const deps = workspaceDeps(appDir);
    expect(deps).toContain("packages/analyst-contract"); // guards against the walk silently finding nothing
    const skipped = deps.filter((dep) => exitCode(args, `${dep}/src/changed.ts`) !== 1);
    expect(skipped).toEqual([]);
  });
});
