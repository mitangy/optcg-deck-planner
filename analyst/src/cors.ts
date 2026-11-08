/** Browsers may call /chat from the two apps, their Vercel previews and local dev. Auth is the bearer token, not cookies. */
export function originAllowed(allowed: string[], origin: string | undefined): boolean {
  if (!origin) return false;
  return allowed.includes(origin) || /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin) || /^http:\/\/localhost:\d+$/.test(origin);
}
