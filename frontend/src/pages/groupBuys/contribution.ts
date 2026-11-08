/** Contribution settings for the group buy Filters panel (#1177). */

export type ContributionFlags = {
  include_singles: boolean;
  include_extra_copies: boolean;
};

export type ContributionUpdate = ContributionFlags & {
  deck_ids: number[] | null;
};

/**
 * Request body for one change. The server always applies `deck_ids` (null = all decks), so a flag
 * toggle re-sends the current deck pick and a deck toggle re-sends the current flags.
 */
export function contributionUpdate(
  current: { deck_ids: number[] | null } & Partial<ContributionFlags>,
  patch: Partial<ContributionUpdate>,
): ContributionUpdate {
  return {
    deck_ids: "deck_ids" in patch ? (patch.deck_ids ?? null) : current.deck_ids,
    include_singles: patch.include_singles ?? current.include_singles ?? true,
    include_extra_copies: patch.include_extra_copies ?? current.include_extra_copies ?? false,
  };
}

/** Filter-summary chips for the non-default parts of the contribution. */
export function contributionSummary(opts: {
  deckCount: number;
  selectedDeckCount: number;
  allDecksSelected: boolean;
  includeSingles: boolean;
  includeExtraCopies: boolean;
}): string[] {
  const out: string[] = [];
  if (opts.deckCount > 0 && !opts.allDecksSelected) {
    out.push(`${opts.selectedDeckCount}/${opts.deckCount} decks`);
  }
  if (!opts.includeSingles) out.push("No singles");
  if (opts.includeExtraCopies) out.push("Extra copies");
  return out;
}
