export const PROTOCOL_VERSION = 5 as const;
export type ProtocolVersion = typeof PROTOCOL_VERSION;

export function isProtocolVersion(v: unknown): v is ProtocolVersion {
  return v === PROTOCOL_VERSION;
}

export const TAKEN_OVER_CLOSE_CODE = 4451;

/** Matchmaker room names. Each is its own pool, so a casual player is never paired into a ranked game or the other way round. */
export const QUEUE_ROOM = { ranked: "ranked_queue", casual: "casual_queue" } as const;
export type QueueMode = keyof typeof QUEUE_ROOM;

/** Size caps (characters of the data URL) so skins cannot bloat room memory. */
export const SKIN_MAX_PLAYMAT_CHARS = 450_000;
export const SKIN_MAX_CARD_BACK_CHARS = 90_000;

export const SKIN_DATA_URL = /^data:image\/(?:jpeg|webp|png);base64,[A-Za-z0-9+/]+={0,2}$/;
// Relative to the API base: players fetch the image from the API instead of the game server relaying up to 450 KB of base64 to every seat.
export const SKIN_PUBLIC_PATH = /^\/duel\/cosmetics\/\d{1,12}\/public\/[A-Za-z0-9_-]{16,128}$/;

export const CHAT_MAX_LENGTH = 200;

export const INTENT_CARD_ID_MAX_LENGTH = 64;

export const HAND_ORDER_MAX_IDS = 100;
export const HAND_ORDER_MAX_ID_LENGTH = 64;

export const DICE_STEP_SECONDS = 20;

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
  server_restarting: "server_restarting",
  pong: "pong",
} as const;
export type ServerMessageType = (typeof SERVER_MESSAGE)[keyof typeof SERVER_MESSAGE];
