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

/** An uploaded skin sent inline as an image data URL. */
export const SKIN_DATA_URL = /^data:image\/(?:jpeg|webp|png);base64,[A-Za-z0-9+/]+={0,2}$/;
/**
 * A signed link to an uploaded cosmetic, relative to the API base (`/duel/cosmetics/<id>/public/<sig>`; the
 * backend builds it from a database id and a 32-char signature). Players fetch the image from the API (cached
 * by the browser) instead of the game server relaying up to 450 KB of base64 to every seat and spectator.
 */
export const SKIN_PUBLIC_PATH = /^\/duel\/cosmetics\/\d{1,12}\/public\/[A-Za-z0-9_-]{16,128}$/;

/** Max characters per chat line (after trimming / control-char stripping). */
export const CHAT_MAX_LENGTH = 200;

/** Most cards a hand_order message may list (a hand never holds more). */
export const HAND_ORDER_MAX_IDS = 100;
/** Longest card instance id a hand_order message may carry. */
export const HAND_ORDER_MAX_ID_LENGTH = 64;

/** How long each step of the opening dice roll (call, roll, choose) waits before the server acts for the seat (#1190). */
export const DICE_STEP_SECONDS = 20;

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
  dice: "dice",
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
  dice_state: "dice_state",
  presence: "presence",
  undo_state: "undo_state",
  undo_applied: "undo_applied",
  taken_over: "taken_over",
  pong: "pong",
} as const;
export type ServerMessageType = (typeof SERVER_MESSAGE)[keyof typeof SERVER_MESSAGE];
