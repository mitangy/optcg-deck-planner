/** Draft eval case stubs from players' "This is wrong" ratings (#679). A human finishes each one; nothing here is a case yet. */

/** One rating as GET /admin/feedback/export returns it. */
export type FeedbackItem = {
  id: number;
  updated_at: string | null;
  kind: "chat" | "review";
  rating: string;
  note: string;
  question: string;
  answer_excerpt: string;
  model: string;
  thread_id: number | null;
  match_id: string | null;
};

export type CaseStub = {
  id: string;
  source: "player-feedback";
  kind: "chat" | "review";
  /** What the player asked (chat). A review has no question: replay the game below. */
  question: string;
  /** For a review: the game it is about. Replay it with the bot corpus or the recorded replay. */
  match_id: string | null;
  /** What Log Pose said, as far as stored, and what the player said was wrong with it. */
  bad_answer: string;
  player_note: string;
  model: string;
  rated_at: string | null;
  /** For the human to fill in. */
  todo: string;
};

export function caseStub(item: FeedbackItem): CaseStub {
  return {
    id: `fb-${item.id}`,
    source: "player-feedback",
    kind: item.kind,
    question: item.question,
    match_id: item.match_id,
    bad_answer: item.answer_excerpt,
    player_note: item.note,
    model: item.model,
    rated_at: item.updated_at,
    todo:
      item.kind === "review"
        ? "Find the false claim, add the game to the review-facts set or a gold check, and say what the review should have said."
        : "Decide whether the answer is really wrong. If it is, write the gold (a ruling, a number, a legal line) and pick a group in cases.ts.",
  };
}

/** The stubs as JSON lines, oldest rating first, skipping any whose answer was not stored. */
export function stubsJsonl(items: readonly FeedbackItem[]): string {
  const stubs = items
    .filter((i) => i.rating === "wrong" && i.answer_excerpt.trim())
    .map(caseStub)
    .reverse();
  return stubs.map((s) => JSON.stringify(s)).join("\n") + (stubs.length ? "\n" : "");
}
