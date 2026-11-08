import type { DuelEvent, EventProgress } from "./eventApi";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "3d 4h", "2h 10m", "12m"; "<1m" under a minute. Rounds down, so a countdown never promises more time than is left. */
export function formatCountdown(ms: number): string {
  if (ms < MINUTE) return "<1m";
  const days = Math.floor(ms / DAY);
  const hours = Math.floor((ms % DAY) / HOUR);
  const minutes = Math.floor((ms % HOUR) / MINUTE);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export type Phase = "upcoming" | "live" | "ended" | "drawn";

/** The phase from the clock, so the banner flips at the start and the end without a reload. A drawn event stays drawn. */
export function eventPhase(event: Pick<DuelEvent, "starts_at" | "ends_at" | "status">, now: number): Phase {
  if (event.status === "drawn") return "drawn";
  if (now < Date.parse(event.starts_at)) return "upcoming";
  if (now < Date.parse(event.ends_at)) return "live";
  return "ended";
}

/** The line under the title: the countdown while upcoming or live, then what happens next. */
export function statusLine(event: Pick<DuelEvent, "starts_at" | "ends_at" | "status"> & Partial<Pick<DuelEvent, "prize_method">>, now: number): string {
  const phase = eventPhase(event, now);
  if (phase === "upcoming") return `Starts in ${formatCountdown(Date.parse(event.starts_at) - now)}`;
  if (phase === "live") return `Live now · ends in ${formatCountdown(Date.parse(event.ends_at) - now)}`;
  if (phase === "ended") return event.prize_method === "placement" ? "Ended" : "Ended · winners drawn soon";
  return "Winners drawn";
}

/** "2 of 3 games · 1 of 2 opponents": the player's own counted games and distinct opponents. */
export function progressLabel(progress: EventProgress, event: Pick<DuelEvent, "min_games" | "min_opponents">): string {
  const games = Math.min(progress.games, event.min_games);
  const opps = Math.min(progress.opponents, event.min_opponents);
  return `${games} of ${event.min_games} games · ${opps} of ${event.min_opponents} opponents`;
}

export type Cta = "join" | "signin" | "joined" | "none";

/** What the banner offers. Entries close when the event ends; the button follows the clock, not the server's last answer. */
export function bannerCta(event: Pick<DuelEvent, "starts_at" | "ends_at" | "status" | "viewer" | "can_join" | "opted_in">, now: number): Cta {
  if (event.opted_in) return "joined";
  const phase = eventPhase(event, now);
  if (phase === "ended" || phase === "drawn") return "none";
  if (event.viewer === "anonymous") return "signin";
  return event.can_join ? "join" : "none";
}

/** The muted line shown instead of a button. "Entries closed" is only true once the event is over; before that, say why this viewer cannot enter. */
export function closedNote(
  event: Pick<DuelEvent, "starts_at" | "ends_at" | "status" | "viewer" | "cant_join_reason">,
  now: number,
): string {
  const phase = eventPhase(event, now);
  if (phase === "ended" || phase === "drawn") return "Entries closed";
  if (event.viewer === "guest") return "Guests can't enter";
  return event.cant_join_reason || "Entries closed";
}

/** Staff may join and play but are never in the draw (#834). Shown until the winners are drawn. */
export function staffNote(event: Pick<DuelEvent, "starts_at" | "ends_at" | "status" | "viewer">, now: number): string | null {
  if (event.viewer !== "staff" || eventPhase(event, now) === "drawn") return null;
  return "You can play, but staff aren't eligible for prizes.";
}

/**
 * "Sun, Nov 22, 12:00 – 4:00 PM EST" in the viewer's time zone (or `timeZone`). One day: the date once, then the two times.
 */
export function formatWindow(startsAt: string, endsAt: string, locale?: string, timeZone?: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const day = new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", timeZone });
  const time = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone });
  const zone = new Intl.DateTimeFormat(locale, { timeZoneName: "short", timeZone })
    .formatToParts(end)
    .find((p) => p.type === "timeZoneName")?.value;
  const sameDay = day.format(start) === day.format(end);
  const tail = `${time.format(start)} – ${sameDay ? "" : `${day.format(end)}, `}${time.format(end)}${zone ? ` ${zone}` : ""}`;
  return `${day.format(start)}, ${tail}`;
}

const FORMAT_NAMES: Record<DuelEvent["format"], string> = {
  casual: "Casual play",
  single_elim: "Single elimination",
  round_robin: "Round robin",
  swiss: "Swiss",
};

/** "Single elimination · 8 players · Bo3", "Swiss · Bo1", or just "Casual play". Casual play has no matches to set a length for. */
export function eventStyleLabel(event: Pick<DuelEvent, "format" | "bracket_size" | "best_of">): string {
  if (event.format === "casual") return FORMAT_NAMES.casual;
  const parts: string[] = [FORMAT_NAMES[event.format]];
  if (event.format === "single_elim" && event.bracket_size) parts.push(`${event.bracket_size} players`);
  parts.push(`Bo${event.best_of}`);
  return parts.join(" · ");
}

/** The banner's prize line: a free giveaway for a draw, top finishers otherwise. An empty prize leaves just the lead-in. */
export function prizeLine(event: Pick<DuelEvent, "prize" | "prize_method">): string {
  const lead = event.prize_method === "draw" ? "Free giveaway" : "Prizes for the top finishers";
  return event.prize ? `${lead} · ${event.prize}` : lead;
}

/** Whether winners come from the seeded draw (and so have a seed, a hash and eligible ids). */
export function usesDraw(event: Pick<DuelEvent, "prize_method">): boolean {
  return event.prize_method === "draw";
}
