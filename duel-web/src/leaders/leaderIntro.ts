import { formatPercent, ordinal, type MetaDeck, type MetaLeader } from "../decks/meta";
import { formatUpdated } from "./snapshot";

export function colorList(color: string): string[] {
  return color.split(/[;/]/).map((c) => c.trim().toLowerCase()).filter(Boolean);
}

export function joinWords(words: readonly string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

export function sharedCards(decks: readonly MetaDeck[]): { name: string; avg: number }[] {
  if (decks.length < 2) return [];
  const totals = new Map<string, { name: string; sum: number; seen: number }>();
  for (const d of decks) {
    for (const c of d.cards) {
      const t = totals.get(c.card_id) ?? { name: c.name || c.card_id, sum: 0, seen: 0 };
      t.sum += c.count;
      t.seen += 1;
      totals.set(c.card_id, t);
    }
  }
  return [...totals.values()]
    .filter((t) => t.seen === decks.length)
    .map((t) => ({ name: t.name, avg: t.sum / decks.length }))
    .sort((a, b) => b.avg - a.avg || a.name.localeCompare(b.name));
}

export function bestFinish(decks: readonly MetaDeck[]): MetaDeck | null {
  const placed = decks.filter((d) => d.placing != null && d.placing > 0);
  if (placed.length === 0) return null;
  return placed.reduce((best, d) => ((d.placing as number) < (best.placing as number) ? d : best));
}

export function leaderIntro(args: { leader: MetaLeader; rank: number; of: number; days: number; decks: readonly MetaDeck[]; lastSeen?: string }): string[] {
  const { leader, rank, of, days, decks, lastSeen } = args;
  const name = leader.name || leader.leader_id;
  const colors = colorList(leader.color);
  const colorText = colors.length > 1 ? `${joinWords(colors)} (two-colour)` : colors[0] ?? "";
  const out: string[] = [];

  if (lastSeen) {
    out.push(
      `${name} (${leader.leader_id}) is ${colorText ? `a ${colorText} leader` : "a leader"} in the One Piece Card Game. ` +
        `In the last ${days} days it was registered in ${leader.decks} tournament decks, ${formatPercent(leader.share)} of the field. ` +
        `It is no longer among the most played leaders, and was last seen in the meta on ${formatUpdated(lastSeen)}.`,
    );
  } else out.push(
    `${name} (${leader.leader_id}) is ${colorText ? `a ${colorText} leader` : "a leader"} in the One Piece Card Game. ` +
      `In the last ${days} days it was registered in ${leader.decks} tournament decks, ${formatPercent(leader.share)} of the field, ` +
      `making it ${rank === 1 ? "the most played" : `the ${ordinal(rank)} most played`} of the ${of} leaders on this site.`,
  );

  const record = `${leader.wins}-${leader.losses}${leader.ties ? `-${leader.ties}` : ""}`;
  if (leader.win_rate == null) {
    out.push(`It reached the top 8 ${leader.top8} ${leader.top8 === 1 ? "time" : "times"}.`);
  } else {
    const side = leader.win_rate >= 0.5 ? "at or above" : "below";
    out.push(
      `Its pilots went ${record} in recorded matches, a ${formatPercent(leader.win_rate)} win rate (${side} an even 50%), ` +
        `and reached the top 8 ${leader.top8} ${leader.top8 === 1 ? "time" : "times"}.`,
    );
  }

  const best = bestFinish(decks);
  const shared = sharedCards(decks).slice(0, 6);
  const parts: string[] = [];
  if (best) parts.push(`The best finish among the lists below is ${ordinal(best.placing as number)} of ${best.players} at ${best.event}.`);
  if (shared.length) parts.push(`All ${decks.length} lists below play ${joinWords(shared.map((c) => `${Math.round(c.avg * 10) / 10}x ${c.name}`))}.`);
  if (parts.length) out.push(parts.join(" "));
  return out;
}

export function dataTail(days: number, updatedAt: string | null): string {
  return `, last ${days} days${updatedAt ? `, updated ${formatUpdated(updatedAt)}` : ""}.`;
}
