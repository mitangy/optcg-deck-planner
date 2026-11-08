/**
 * What every eval runner (`qa/run.ts`, `puzzles/run.ts`, `review-facts/run.ts`, `deck-advice/run.ts`) repeats: the flags they
 * share, the model-api and key check, the default variant name, the output folder, the meta decks file, the synthetic
 * planner fixtures and the Anthropic client. A runner declares its own flags next to `commonOptions` and keeps its own defaults.
 */
import Anthropic from "@anthropic-ai/sdk";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { OfficialLibrary } from "../../src/official/library";
import type { PlannerOptions, StatsFixtures, TournamentFixtures } from "./planner";

/** `analyst/evals`, so a suite finds `out/`, `fixtures/` and the like wherever its own folder is. */
const EVALS_DIR = fileURLToPath(new URL("..", import.meta.url));
export const evalsPath = (...parts: string[]): string => join(EVALS_DIR, ...parts);

/** Where runs write their reports (git-ignored): `out/<variant>` for the core suite, `out/<suite>/<variant>` for the others. */
export const OUT_ROOT = evalsPath("out");
export const suiteOutDir = (suite: string): string => join(OUT_ROOT, suite);

/** The meta decks file the self-play and deck-advice suites default to when it is present (`npm run meta-decks` writes one). */
const META_DECKS = "/mnt/project-files/self-play-bots/meta-decks-2026-10-18.json";
export const metaDecksFile = (flag: string | undefined): string | undefined => flag ?? (existsSync(META_DECKS) ? META_DECKS : undefined);

/** The `parseArgs` options every runner has; each passes its own defaults for the numbers. */
export const commonOptions = (d: { maxUsd: string; concurrency: string; timeoutS: string }) =>
  ({
    variant: { type: "string" },
    "max-usd": { type: "string", default: d.maxUsd },
    concurrency: { type: "string", default: d.concurrency },
    "timeout-s": { type: "string", default: d.timeoutS },
    "model-api": { type: "string", default: "anthropic" },
    post: { type: "boolean", default: false },
  }) as const;

/**
 * Whether this is a free dry run (`--model-api scripted`). Anything but `anthropic` is refused, and a paid run without
 * ANTHROPIC_API_KEY exits with code 2 and a message naming the npm script (`hint` adds what else is free).
 */
export function modelApi(flag: string | undefined, o: { script: string; needsKey?: boolean; hint?: string }): { scripted: boolean } {
  const scripted = flag === "scripted";
  if (!scripted && flag !== "anthropic") throw new Error("--model-api must be anthropic or scripted");
  if (!scripted && o.needsKey !== false && !process.env.ANTHROPIC_API_KEY) {
    console.error(`npm run ${o.script} spends Anthropic API money and needs ANTHROPIC_API_KEY. For a free dry run use --model-api scripted${o.hint ?? ""}.`);
    process.exit(2);
  }
  return { scripted };
}

/** The output folder name when `--variant` is not given. */
export const defaultVariant = (flag: string | undefined, dryRun: boolean): string => flag ?? (dryRun ? "dry-run" : "baseline");

/** The real client, or null for a scripted run. */
export const anthropicClient = (scripted: boolean): Anthropic | null => (scripted ? null : new Anthropic());

/** The official-site library the tools read the ban list and rulings from, unless `choice` is "none". */
export const libraryFor = (choice: string | undefined): OfficialLibrary | undefined => (choice === "none" ? undefined : new OfficialLibrary({ baseUrl: process.env.OFFICIAL_SITE_URL || undefined }));

/** The synthetic matchup stats and tournament answers the fake planner serves (`fixtures/`). */
export function plannerFixtures(): { stats: StatsFixtures; tournaments: TournamentFixtures } {
  return {
    stats: JSON.parse(readFileSync(evalsPath("fixtures/stats.json"), "utf8")) as StatsFixtures,
    tournaments: JSON.parse(readFileSync(evalsPath("fixtures/tournaments.json"), "utf8")) as TournamentFixtures,
  };
}

/** The fake planner every suite but a `--planner live` run uses. */
export const fakePlanner = (): PlannerOptions => ({ mode: "fake", ...plannerFixtures() });
