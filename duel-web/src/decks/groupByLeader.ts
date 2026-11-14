/**
 * Groups items by leader (#1294). Groups come in the order of their first item and items keep their input
 * order inside a group, so a later deck of an earlier leader joins that leader's group.
 */
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
