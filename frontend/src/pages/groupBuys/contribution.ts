
export type ContributionFlags = {
  include_singles: boolean;
  include_extra_copies: boolean;
};

export type ContributionUpdate = ContributionFlags & {
  deck_ids: number[] | null;
};

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
