// Hidden only for the choice it was hidden on: the next choice always shows.
export function isPromptHidden(hiddenChoiceId: string | null, frontChoiceId: string): boolean {
  return hiddenChoiceId === frontChoiceId;
}

export function promptOpenFor(
  choice: { id: string; seat: number } | null | undefined,
  mySeat: number | null,
  hiddenChoiceId: string | null,
): boolean {
  return choice != null && choice.seat === mySeat && !isPromptHidden(hiddenChoiceId, choice.id);
}
