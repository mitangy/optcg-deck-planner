/**
 * "Hide" on a choice pop-up tucks it behind a "Back to …" pill so the hand and
 * board can be read before answering. The pop-up stays hidden only for the
 * choice it was hidden on: the next choice always shows.
 */
export function isPromptHidden(hiddenChoiceId: string | null, frontChoiceId: string): boolean {
  return hiddenChoiceId === frontChoiceId;
}
