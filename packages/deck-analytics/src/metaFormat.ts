// Tournament ("meta") deck text, shared by the planner and the duel app so the same list reads the
// same in both. Pure: no React, no network.

/** Longest deck name POST /decks accepts. */
export const DECK_NAME_MAX = 200;

/** Default look-back window of the meta pages, in days. */
export const META_DEFAULT_DAYS = 30;

/** 1 -> "1st", 2 -> "2nd", 11 -> "11th", 22 -> "22nd". */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** A real placing: 1 and up. Missing, 0 and negative values mean "no placing". */
function hasPlacing(placing: number | null | undefined): placing is number {
  return placing != null && placing > 0;
}

/** "Silvers Rayleigh – 1st Weekly Cup"; without a placing, "Silvers Rayleigh – Weekly Cup". */
export function metaDeckName(
  leaderName: string,
  leaderId: string,
  deck: { placing: number | null | undefined; event: string },
): string {
  const leader = leaderName.trim() || leaderId;
  const place = hasPlacing(deck.placing) ? `${ordinal(deck.placing)} ` : "";
  return `${leader} – ${place}${deck.event.trim()}`.trim().slice(0, DECK_NAME_MAX).trim();
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-28" -> "Sep 28". Parsed by hand so the viewer's time zone cannot shift the day. */
export function formatMetaDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${Number(m[3])}` : iso;
}

/**
 * "1st of 128 · Sep 28 · 7-0-0", or with `event` set "1st of 128 · Weekly Cup · Sep 28 · 7-0-0".
 * Without a placing it reads "128 players · ...".
 */
export function formatDeckRow(
  deck: {
    placing: number | null | undefined;
    players: number;
    date: string;
    record: { wins: number; losses: number; ties: number };
    event?: string;
  },
  options: { event?: boolean } = {},
): string {
  const { wins, losses, ties } = deck.record;
  const place = hasPlacing(deck.placing) ? `${ordinal(deck.placing)} of ${deck.players}` : `${deck.players} players`;
  const parts = [place, ...(options.event && deck.event ? [deck.event] : []), formatMetaDate(deck.date), `${wins}-${losses}-${ties}`];
  return parts.join(" · ");
}

/** 0.081 -> "8.1%"; missing -> "—". */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}
