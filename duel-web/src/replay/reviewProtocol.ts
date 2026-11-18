import type { MatchReplay } from "@optcg/rules/replay/replayTimeline";
import type { GameReview } from "./reviewModel";

export type ReviewRequest = { type: "start"; replay: MatchReplay };
export type ReviewMessage =
  | { type: "progress"; progress: number; review: GameReview }
  | { type: "done"; review: GameReview }
  | { type: "error"; message: string };

export const REVIEW_SLICE = 4;
