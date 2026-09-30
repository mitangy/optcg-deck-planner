/**
 * Keep secrets out of Vercel Analytics and Speed Insights: the auth callback carries tokens in the
 * hash and invite links carry room codes in `?join=`, so only origin + path are sent.
 */
export function redactAnalyticsUrl(url: string): string {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname}`;
}

/** `beforeSend` for both `<Analytics />` and `<SpeedInsights />`. */
export function analyticsBeforeSend<T extends { url: string }>(event: T): T {
  return { ...event, url: redactAnalyticsUrl(event.url) };
}
