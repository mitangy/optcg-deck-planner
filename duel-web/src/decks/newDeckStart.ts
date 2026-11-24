import { saveDeck, type SavedDeck } from "./storage";

export type NewDeckStart = "leader" | "meta" | "paste";

export const NEW_DECK_STARTS: readonly { id: NewDeckStart; label: string }[] = [
  { id: "leader", label: "Pick a Leader" },
  { id: "meta", label: "Copy a meta deck" },
  { id: "paste", label: "Paste a list" },
];

export const LEADER_COLORS = ["red", "green", "blue", "purple", "black", "yellow"] as const;

export type PickableLeader = { id: string; name: string; colors: readonly string[] };

/** A deck created from a Leader with no name typed is called "<Leader name> deck". */
export function leaderDeckName(typed: string, leaderName: string): string {
  return typed.trim() || `${leaderName.trim()} deck`;
}

/** Name matches (or the id), and the Leader has at least one of the chosen colours when any are chosen. */
export function filterLeaders<T extends PickableLeader>(leaders: readonly T[], query: string, colors: readonly string[]): T[] {
  const q = query.trim().toLowerCase();
  const wanted = colors.map((c) => c.toLowerCase());
  return leaders.filter(
    (l) =>
      (!q || `${l.name}\n${l.id}`.toLowerCase().includes(q)) &&
      (wanted.length === 0 || l.colors.some((c) => wanted.includes(c.toLowerCase()))),
  );
}

export function startButtonLabel(start: NewDeckStart, pastedList: string): string {
  if (start === "leader") return "Create deck";
  if (start === "meta") return "Copy this deck";
  return pastedList.trim() ? "Import deck" : "Create blank deck";
}

export function createLeaderDeck(leader: { id: string; name: string }, typedName: string): SavedDeck {
  return saveDeck({ name: leaderDeckName(typedName, leader.name), leaderId: leader.id, cards: [] });
}
