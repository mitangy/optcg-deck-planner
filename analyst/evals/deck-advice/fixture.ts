/** Test helper: four real meta decks (blue, red/green, black, red) copied from the meta deck file. */
import { readFileSync } from "node:fs";
import type { MetaDeck } from "./sabotage";

export const fixtureDecks = (): MetaDeck[] => JSON.parse(readFileSync(new URL("./fixtures/meta-decks.json", import.meta.url), "utf8")) as MetaDeck[];
