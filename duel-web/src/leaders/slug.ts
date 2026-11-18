const LEADER_ID_AT_START = /^(p-\d{3}|[a-z]{2,4}\d{2}-\d{3})(?:-(.*))?$/;

export function slugifyName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function leaderSlug(leaderId: string, name: string): string {
  const id = leaderId.trim().toLowerCase();
  const tail = slugifyName(name);
  return tail ? `${id}-${tail}` : id;
}

export function leaderPath(leader: { leader_id: string; name: string }): string {
  return `/leaders/${leaderSlug(leader.leader_id, leader.name)}`;
}

export function parseLeaderSlug(slug: string): { leaderId: string; nameSlug: string } | null {
  const m = LEADER_ID_AT_START.exec(slug.trim().toLowerCase());
  return m ? { leaderId: m[1].toUpperCase(), nameSlug: m[2] ?? "" } : null;
}

export type LeaderRoute<L> =
  | { kind: "page"; leader: L }
  | { kind: "redirect"; to: string; leader: L }
  | { kind: "unknown"; leaderId: string | null };

export function resolveLeaderRoute<L extends { leader_id: string; name: string }>(slug: string, leaders: readonly L[]): LeaderRoute<L> {
  const parsed = parseLeaderSlug(slug);
  if (!parsed) return { kind: "unknown", leaderId: null };
  const leader = leaders.find((l) => l.leader_id.toUpperCase() === parsed.leaderId);
  if (!leader) return { kind: "unknown", leaderId: parsed.leaderId };
  const canonical = leaderSlug(leader.leader_id, leader.name);
  return slug === canonical ? { kind: "page", leader } : { kind: "redirect", to: `/leaders/${canonical}`, leader };
}
