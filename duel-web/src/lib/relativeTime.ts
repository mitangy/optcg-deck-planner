/**
 * "How long ago" text. The app writes it in three styles on purpose (each keeps the wording and the cut-off its
 * screen already had), so they live side by side here instead of in three files:
 *  - `historyAgo`: match history rows, "45m ago" ... "3d ago", the short date from a week on.
 *  - `staffAgo`: the admin account page, "5 min ago" ... "3 days ago", the ISO date from a month on.
 *  - `compactAgo`: the admin hosting rows, "5m ago" / "3h ago" / "2d ago", never a date.
 * `now` is injected for tests.
 */

/** Match history: rounds to the nearest unit; from 7 days on the month and day. */
export function historyAgo(then: Date, now: Date): string {
  const mins = Math.round((now.getTime() - then.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Admin account page: "5 min ago", "3 days ago"; past a month the date. Rounds down. */
export function staffAgo(iso: string, now: number = Date.now()): string {
  const secs = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 31) return `${days} ${days === 1 ? "day" : "days"} ago`;
  return iso.slice(0, 10);
}

/** Admin hosting rows: "—" with no time, then "5m ago" up to an hour, "3h ago" up to two days, then days. */
export function compactAgo(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "—";
  const mins = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (mins < 60) return `${mins}m ago`;
  if (mins < 2880) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}
