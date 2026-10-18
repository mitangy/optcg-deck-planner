import type { getPlayerView } from "../engine.js";
import type { Rng } from "../rng.js";

export type BotView = ReturnType<typeof getPlayerView>;
export type BotLevel = "easy" | "normal";

export interface BotOptions {
  level?: BotLevel;
  /** Seeded rng for tie-breaks; the same view, level and rng state always give the same intent. */
  rng?: Rng;
}
