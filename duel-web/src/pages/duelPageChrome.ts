// Chat and the Bounty strip only mean something against another person: a bot cannot read chat and a bot game never moves the Bounty (#1343).
export function duelPageChrome(o: { vsBot: boolean; spectating: boolean; rating: number | null }): {
  bounty: boolean;
  chat: boolean;
} {
  return { bounty: o.rating != null && !o.spectating && !o.vsBot, chat: !o.vsBot };
}
