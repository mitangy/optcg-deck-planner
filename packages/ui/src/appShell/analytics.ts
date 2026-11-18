// Only origin + path are sent, so share tokens in `?…`, auth tokens in `#…` and invite codes never leave the browser.
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

export function createAnalyticsBeforeSend(tokenRoutes: readonly string[] = []) {
  return <T extends { url: string }>(event: T): T => ({ ...event, url: redactAnalyticsUrl(event.url, tokenRoutes) });
}
