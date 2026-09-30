/** Path segments after these prefixes are share/invite secrets, not page names. */
const TOKEN_ROUTES = ["/share/", "/group-buy/join/", "/group-buy/view/"];

/**
 * Keep share tokens and query strings out of Vercel Analytics and Speed Insights: drops `?…`/`#…`
 * and replaces the token segment of public share/group-buy links with `[token]`.
 */
export function redactAnalyticsUrl(url: string): string {
  const parsed = new URL(url);
  let path = parsed.pathname;
  for (const prefix of TOKEN_ROUTES) {
    if (path.startsWith(prefix) && path.length > prefix.length) {
      path = `${prefix}[token]`;
      break;
    }
  }
  return `${parsed.origin}${path}`;
}

/** `beforeSend` for both `<Analytics />` and `<SpeedInsights />`. */
export function analyticsBeforeSend<T extends { url: string }>(event: T): T {
  return { ...event, url: redactAnalyticsUrl(event.url) };
}
