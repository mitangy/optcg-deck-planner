import { readFileSync } from "node:fs";
import type { MatchReplay } from "@optcg/rules";

export const fixtureReplay = (): MatchReplay => JSON.parse(readFileSync(new URL("./fixtures/game-seed7.json", import.meta.url), "utf8")) as MatchReplay;
