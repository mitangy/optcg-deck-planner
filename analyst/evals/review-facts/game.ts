/** Test helper: the short self-play game the tests read (seed 7, random decks, Normal vs Normal, seat 0 goes first and loses). */
import { readFileSync } from "node:fs";
import type { MatchReplay } from "@optcg/rules";

export const fixtureReplay = (): MatchReplay => JSON.parse(readFileSync(new URL("./fixtures/game-seed7.json", import.meta.url), "utf8")) as MatchReplay;
