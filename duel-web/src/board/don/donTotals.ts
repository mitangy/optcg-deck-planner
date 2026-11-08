type Attachable = { attachedDonCount?: number };

type DonSide = {
  leader: Attachable;
  characters: Attachable[];
  stage?: Attachable | null;
};

/**
 * DON!! attached to a Leader / Character leaves the cost area but is still the
 * player's DON!!, so the "active/total" counter must add it back (#345).
 */
export function attachedDonTotal(side: DonSide): number {
  let total = side.leader.attachedDonCount ?? 0;
  for (const c of side.characters) total += c.attachedDonCount ?? 0;
  total += side.stage?.attachedDonCount ?? 0;
  return total;
}

/** Cost-area DON!! plus DON!! attached to the Leader, Characters and Stage. */
export function donTotal(costAreaCount: number, side: DonSide): number {
  return costAreaCount + attachedDonTotal(side);
}
