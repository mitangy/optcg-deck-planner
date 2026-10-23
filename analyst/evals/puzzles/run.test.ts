import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const analyst = fileURLToPath(new URL("../../", import.meta.url));
const run = (args: string[], env: Record<string, string | undefined> = {}) =>
  spawnSync("npx", ["tsx", "evals/puzzles/run.ts", ...args], { cwd: analyst, encoding: "utf8", env: { ...process.env, ANTHROPIC_API_KEY: undefined, ...env }, timeout: 120_000 });

describe("npm run eval:puzzles", () => {
  it("exits 2 and says why when the real API is asked for without a key (#677)", () => {
    const r = run(["--n", "1", "--variant", `no-key-${process.pid}`]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("needs ANTHROPIC_API_KEY");
    expect(r.stderr).toContain("--model-api scripted");
  }, 120_000);

  it("writes the puzzles with --dump and needs no key (#677)", () => {
    const variant = `dump-test-${process.pid}-${Date.now()}`;
    const r = run(["--dump", "--n", "1", "--types", "power", "--variant", variant]);
    const dir = join(analyst, "evals/out/puzzles", variant);
    try {
      expect(r.status).toBe(0);
      const lines = readFileSync(join(dir, "puzzles.jsonl"), "utf8").trim().split("\n");
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0]!)).toMatchObject({ type: "power", gold: { key: "power", mode: "number" } });
      expect(existsSync(join(dir, "answers.jsonl"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("runs the whole pipeline with --model-api scripted and writes puzzles, answers and a report (#677)", () => {
    const variant = `scripted-test-${process.pid}-${Date.now()}`;
    const r = run(["--model-api", "scripted", "--n", "2", "--types", "power,scenario", "--variant", variant]);
    const dir = join(analyst, "evals/out/puzzles", variant);
    try {
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toMatch(/puzzles: \d+\.\d% \(\d+\/4, 95% Wilson/);
      expect(readFileSync(join(dir, "puzzles.jsonl"), "utf8").trim().split("\n")).toHaveLength(4);
      expect(readFileSync(join(dir, "answers.jsonl"), "utf8").trim().split("\n")).toHaveLength(4);
      expect(readFileSync(join(dir, "report.md"), "utf8")).toContain("## Worst misses");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
