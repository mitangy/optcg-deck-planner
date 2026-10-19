/**
 * Routes that hide the legal footer: a match (online, hotseat, demo, replay) fills the
 * screen, and the sign-in hand-off redirects straight away.
 */
const NO_FOOTER = ["/duel", "/hotseat", "/demo", "/replay", "/auth/complete"];

export function showsSiteFooter(pathname: string): boolean {
  return !NO_FOOTER.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
