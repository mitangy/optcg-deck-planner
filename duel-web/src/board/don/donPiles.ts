export type DonPiles = Record<string, number>;

export const MAX_DON_PILES = 4;

type DonToken = { id: string; rested: boolean };

function pileOf(piles: DonPiles, id: string): number {
  return piles[id] ?? 0;
}

export function movePile(piles: DonPiles, ids: readonly string[], presentIds: readonly string[]): DonPiles {
  const present = new Set(presentIds);
  const moving = ids.filter((id) => present.has(id));
  if (moving.length === 0) return compact(piles, presentIds);

  const from = pileOf(piles, moving[0]!);
  const movingSet = new Set(moving);
  const inFrom = presentIds.filter((id) => pileOf(piles, id) === from);
  const wholePile = inFrom.every((id) => movingSet.has(id));
  const highest = Math.max(...presentIds.map((id) => pileOf(piles, id)));
  const next = from + 1;
  const target = (wholePile && from === highest) || next >= MAX_DON_PILES ? 0 : next;

  const moved: DonPiles = { ...piles };
  for (const id of moving) moved[id] = target;
  return compact(moved, presentIds);
}

function compact(piles: DonPiles, presentIds: readonly string[]): DonPiles {
  const used = [...new Set(presentIds.map((id) => pileOf(piles, id)))].sort((a, b) => a - b);
  const rank = new Map(used.map((p, i) => [p, i]));
  const out: DonPiles = {};
  for (const id of presentIds) {
    const r = rank.get(pileOf(piles, id)) ?? 0;
    if (r > 0) out[id] = r;
  }
  return out;
}

export function groupIntoPiles<T extends DonToken>(tokens: readonly T[], piles: DonPiles): T[][] {
  const byPile = new Map<number, T[]>();
  for (const t of tokens) {
    const p = pileOf(piles, t.id);
    const list = byPile.get(p);
    if (list) list.push(t);
    else byPile.set(p, [t]);
  }
  return [...byPile.keys()]
    .sort((a, b) => a - b)
    .map((p) => {
      const list = byPile.get(p)!;
      return [...list.filter((t) => !t.rested), ...list.filter((t) => t.rested)];
    });
}
