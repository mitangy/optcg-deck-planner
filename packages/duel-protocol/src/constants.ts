/** Wire constants shared by the game server and duel-web. */

export const PROTOCOL_VERSION = 5 as const;
export type ProtocolVersion = typeof PROTOCOL_VERSION;

export function isProtocolVersion(v: unknown): v is ProtocolVersion {
  return v === PROTOCOL_VERSION;
}

/** Close code sent to a socket whose seat moved to another device (#451). */
export const TAKEN_OVER_CLOSE_CODE = 4451;

/** Size caps (characters of the data URL) so skins cannot bloat room memory. */
export const SKIN_MAX_PLAYMAT_CHARS = 450_000;
export const SKIN_MAX_CARD_BACK_CHARS = 90_000;

/** Max characters per chat line (after trimming / control-char stripping). */
export const CHAT_MAX_LENGTH = 200;

/** Most cards a hand_order message may list (a hand never holds more). */
export const HAND_ORDER_MAX_IDS = 100;
/** Longest card instance id a hand_order message may carry. */
export const HAND_ORDER_MAX_ID_LENGTH = 64;

/** Messages a client sends to a duel room. */
export const CLIENT_MESSAGE = {
  intent: "intent",
  concede: "concede",
  sync: "sync",
  ping: "ping",
  skin: "skin",
  cosmetics: "cosmetics",
  chat: "chat",
  hand_order: "hand_order",
  undo: "undo",
  rematch: "rematch",
} as const;
export type ClientMessageType = (typeof CLIENT_MESSAGE)[keyof typeof CLIENT_MESSAGE];

/** Messages a duel room sends to its clients. */
export const SERVER_MESSAGE = {
  welcome: "welcome",
  view: "view",
  events: "events",
  error: "error",
  match_over: "match_over",
  cosmetics: "cosmetics",
  skin: "skin",
  timer: "timer",
  chat: "chat",
  chat_history: "chat_history",
  rematch_state: "rematch_state",
  presence: "presence",
  undo_state: "undo_state",
  undo_applied: "undo_applied",
  taken_over: "taken_over",
  pong: "pong",
} as const;
export type ServerMessageType = (typeof SERVER_MESSAGE)[keyof typeof SERVER_MESSAGE];
