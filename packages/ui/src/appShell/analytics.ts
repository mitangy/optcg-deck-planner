/**
 * Keep secrets out of Vercel Analytics and Speed Insights. Only origin + path are sent, so share
 * tokens in `?…`, auth tokens in `#…` and invite codes in `?join=` never leave the browser. An app
 * whose paths carry a secret segment lists the prefixes in front of it (`/share/`) and that segment
 * is replaced with `[token]`.
 */
export function redactAnalyticsUrl(url: string, tokenRoutes: readonly string[] = []): string {
  const parsed = new URL(url);
  let path = parsed.pathname;
  for (const prefix of tokenRoutes) {
    if (path.startsWith(prefix) && path.length > prefix.length) {
      path = `${prefix}[token]`;
      break;
    }
  }
  return `${parsed.origin}${path}`;
}

/** `beforeSend` for both `<Analytics />` and `<SpeedInsights />`, scrubbing the given token routes. */
export function createAnalyticsBeforeSend(tokenRoutes: readonly string[] = []) {
  return <T extends { url: string }>(event: T): T => ({ ...event, url: redactAnalyticsUrl(event.url, tokenRoutes) });
}
