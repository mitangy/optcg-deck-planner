import Anthropic from "@anthropic-ai/sdk";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { OfficialLibrary } from "../../src/official/library";
import type { PlannerOptions, StatsFixtures, TournamentFixtures } from "./planner";

/** `analyst/evals`, so a suite finds `out/`, `fixtures/` and the like wherever its own folder is. */
const EVALS_DIR = fileURLToPath(new URL("..", import.meta.url));
export const evalsPath = (...parts: string[]): string => join(EVALS_DIR, ...parts);

export const OUT_ROOT = evalsPath("out");
export const suiteOutDir = (suite: string): string => join(OUT_ROOT, suite);

const META_DECKS = "/mnt/project-files/self-play-bots/meta-decks-2026-10-18.json";
export const metaDecksFile = (flag: string | undefined): string | undefined => flag ?? (existsSync(META_DECKS) ? META_DECKS : undefined);

export const commonOptions = (d: { maxUsd: string; concurrency: string; timeoutS: string }) =>
  ({
    variant: { type: "string" },
    "max-usd": { type: "string", default: d.maxUsd },
    concurrency: { type: "string", default: d.concurrency },
    "timeout-s": { type: "string", default: d.timeoutS },
    "model-api": { type: "string", default: "anthropic" },
    post: { type: "boolean", default: false },
  }) as const;

export function modelApi(flag: string | undefined, o: { script: string; needsKey?: boolean; hint?: string }): { scripted: boolean } {
  const scripted = flag === "scripted";
  if (!scripted && flag !== "anthropic") throw new Error("--model-api must be anthropic or scripted");
  if (!scripted && o.needsKey !== false && !process.env.ANTHROPIC_API_KEY) {
    console.error(`npm run ${o.script} spends Anthropic API money and needs ANTHROPIC_API_KEY. For a free dry run use --model-api scripted${o.hint ?? ""}.`);
    process.exit(2);
  }
  return { scripted };
}

export const defaultVariant = (flag: string | undefined, dryRun: boolean): string => flag ?? (dryRun ? "dry-run" : "baseline");

export const anthropicClient = (scripted: boolean): Anthropic | null => (scripted ? null : new Anthropic());

/** The official-site library the tools read the ban list and rulings from, unless `choice` is "none". */
export const libraryFor = (choice: string | undefined): OfficialLibrary | undefined => (choice === "none" ? undefined : new OfficialLibrary({ baseUrl: process.env.OFFICIAL_SITE_URL || undefined }));

export function plannerFixtures(): { stats: StatsFixtures; tournaments: TournamentFixtures } {
  return {
    stats: JSON.parse(readFileSync(evalsPath("fixtures/stats.json"), "utf8")) as StatsFixtures,
    tournaments: JSON.parse(readFileSync(evalsPath("fixtures/tournaments.json"), "utf8")) as TournamentFixtures,
  };
}

export const fakePlanner = (): PlannerOptions => ({ mode: "fake", ...plannerFixtures() });
