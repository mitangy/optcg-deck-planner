export function groupByLeader<T>(
  items: readonly T[],
  leaderOf: (item: T) => string,
): { leaderId: string; items: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const id = leaderOf(item);
    const group = groups.get(id);
    if (group) group.push(item);
    else groups.set(id, [item]);
  }
  return [...groups].map(([leaderId, grouped]) => ({ leaderId, items: grouped }));
}
