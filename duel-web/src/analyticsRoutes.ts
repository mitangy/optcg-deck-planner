/** Paths whose next segment is a room id or token: analytics sees `/join/[token]`, never the room. */
export const ANALYTICS_TOKEN_ROUTES = ["/join/", "/watch/"] as const;
