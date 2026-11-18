type Attachable = { attachedDonCount?: number };

type DonSide = {
  leader: Attachable;
  characters: Attachable[];
  stage?: Attachable | null;
};

// Attached DON!! leaves the cost area but is still the player's, so active/total must add it back.
export function attachedDonTotal(side: DonSide): number {
  let total = side.leader.attachedDonCount ?? 0;
  for (const c of side.characters) total += c.attachedDonCount ?? 0;
  total += side.stage?.attachedDonCount ?? 0;
  return total;
}

export function donTotal(costAreaCount: number, side: DonSide): number {
  return costAreaCount + attachedDonTotal(side);
}
