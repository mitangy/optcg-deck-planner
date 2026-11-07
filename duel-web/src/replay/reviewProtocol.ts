/** Messages between the replay page and its review worker (#967). Types only, so the page does not bundle the engine twice. */
import type { MatchReplay } from "@optcg/rules/replay/replayTimeline";
import type { GameReview } from "./reviewModel";

export type ReviewRequest = { type: "start"; replay: MatchReplay };
export type ReviewMessage =
  | { type: "progress"; progress: number; review: GameReview }
  | { type: "done"; review: GameReview }
  | { type: "error"; message: string };

/** Ranked decisions per slice: small enough that progress and partial grades arrive every second or so. */
export const REVIEW_SLICE = 4;
