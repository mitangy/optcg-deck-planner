/**
 * Who and where the current match is, for anything that reports back to the
 * API (card reports, feedback). Guests have no session cookie, so the latest
 * game token identifies them; the room id lets a report be matched to a server log.
 */
type MatchContext = { gameToken?: string; roomId?: string };

let matchContext: MatchContext = {};

export function noteMatchGameToken(gameToken: string | undefined): void {
  if (gameToken) matchContext = { ...matchContext, gameToken };
}

export function noteMatchRoom(roomId: string | undefined): void {
  matchContext = { ...matchContext, roomId };
}

export function getMatchContext(): Readonly<MatchContext> {
  return matchContext;
}
