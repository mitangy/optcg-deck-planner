/**
 * "Hide" on a choice pop-up tucks it behind a "Back to …" pill so the hand and
 * board can be read before answering. The pop-up stays hidden only for the
 * choice it was hidden on: the next choice always shows.
 */
export function isPromptHidden(hiddenChoiceId: string | null, frontChoiceId: string): boolean {
  return hiddenChoiceId === frontChoiceId;
}

/**
 * One of your own choice prompts is up and showing: the battle arrow fades
 * while it is, so it never competes with the question. A hidden prompt (tucked
 * behind its "Back to …" pill) or the opponent's choice leaves the arrow alone.
 */
export function promptOpenFor(
  choice: { id: string; seat: number } | null | undefined,
  mySeat: number | null,
  hiddenChoiceId: string | null,
): boolean {
  return choice != null && choice.seat === mySeat && !isPromptHidden(hiddenChoiceId, choice.id);
}
