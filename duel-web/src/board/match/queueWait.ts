/** How long a casual search runs before the bot is offered. */
export const BOT_OFFER_AFTER_S = 45;

export function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function botOfferDue(elapsedSeconds: number): boolean {
  return elapsedSeconds >= BOT_OFFER_AFTER_S;
}
