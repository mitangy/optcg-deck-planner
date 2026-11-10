/**
 * Messages a client sends to a duel room, and the parsers the game server runs on them.
 * Every parser throws a `ProtocolError`; the room answers with its `code`.
 * Intent validation lives in @optcg/rules (`parseIntent`) because it needs the engine's rules; the server
 * wraps it in `parseIntentMessage` (game-server/src/protocol.ts).
 */
import {
  CHAT_MAX_LENGTH,
  HAND_ORDER_MAX_ID_LENGTH,
  HAND_ORDER_MAX_IDS,
  SKIN_DATA_URL,
  SKIN_MAX_CARD_BACK_CHARS,
  SKIN_MAX_PLAYMAT_CHARS,
  SKIN_PUBLIC_PATH,
  PROTOCOL_VERSION,
} from "./constants.js";
import { ProtocolError, bad, expectEnvelope } from "./errors.js";
import type {
  ArtPrefsMap,
  DiceAction,
  DuelJoinOptions,
  PlayerDeckWire,
  RematchAction,
  Seat,
  SeatSkin,
  UndoRequestBody,
} from "./types.js";

/** A positive 31-bit integer (a TCGPlayer productId); anything else is dropped to null, never relayed. */
export function asDonArtId(raw: unknown): number | null {
  return typeof raw === "number" && Number.isSafeInteger(raw) && raw > 0 && raw <= 2_147_483_647
    ? raw
    : null;
}

function asSkinImage(raw: unknown, maxChars: number, field: string): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string" && SKIN_PUBLIC_PATH.test(raw)) return raw;
  if (typeof raw !== "string" || raw.length > maxChars || !SKIN_DATA_URL.test(raw)) {
    throw bad(`${field} must be a small base64 image data URL, a cosmetic link, or null`);
  }
  return raw;
}

/** Parse client → server skin update for the sender's seat. */
export function parseSkinMessage(raw: unknown): SeatSkin {
  const o = expectEnvelope(raw, "skin message");
  const skin = (o.skin && typeof o.skin === "object" ? o.skin : {}) as Record<string, unknown>;
  return {
    playmat: asSkinImage(skin.playmat, SKIN_MAX_PLAYMAT_CHARS, "playmat"),
    cardBack: asSkinImage(skin.cardBack, SKIN_MAX_CARD_BACK_CHARS, "cardBack"),
    donArt: asDonArtId(skin.donArt),
  };
}

export function parseJoinOptions(raw: unknown): DuelJoinOptions {
  if (!raw || typeof raw !== "object") throw bad("Join options required");
  const o = expectEnvelope(raw, "Join options");
  const gameToken =
    typeof o.gameToken === "string" && o.gameToken.trim()
      ? o.gameToken.trim()
      : undefined;
  const devUserId =
    typeof o.devUserId === "string" && o.devUserId.trim()
      ? o.devUserId.trim()
      : undefined;
  if (!gameToken && !devUserId) {
    throw new ProtocolError("gameToken or devUserId required", "unauthorized");
  }
  const preferredSeat = o.preferredSeat;
  if (preferredSeat !== undefined && preferredSeat !== 0 && preferredSeat !== 1) {
    throw bad("preferredSeat must be 0 or 1");
  }
  const roleRaw = o.role;
  let role: "player" | "spectator" | undefined;
  if (roleRaw === "spectator" || roleRaw === "player") {
    role = roleRaw;
  } else if (roleRaw !== undefined) {
    throw bad("role must be player or spectator");
  }
  let deck: PlayerDeckWire | undefined;
  if (o.deck !== undefined) {
    deck = asPlayerDeck(o.deck);
  }
  if (o.takeover !== undefined && typeof o.takeover !== "boolean") {
    throw bad("takeover must be a boolean");
  }
  const takeover = o.takeover === true ? true : undefined;
  if (takeover && (role === "spectator" || preferredSeat === undefined)) {
    throw bad("takeover needs a player role and preferredSeat");
  }
  const ownerToken =
    typeof o.ownerToken === "string" && o.ownerToken.trim() ? o.ownerToken.trim() : undefined;
  return {
    protocolVersion: PROTOCOL_VERSION,
    takeover,
    ownerToken,
    devUserId,
    gameToken,
    secret: typeof o.secret === "string" ? o.secret : undefined,
    preferredSeat: preferredSeat as Seat | undefined,
    role,
    deck,
  };
}

export function asPlayerDeck(raw: unknown): PlayerDeckWire {
  if (!raw || typeof raw !== "object") throw bad("player deck object required");
  const o = raw as Record<string, unknown>;
  if (typeof o.leaderId !== "string" || !Array.isArray(o.deck)) throw bad("leaderId + deck[] required");
  if (o.deck.length > 200) throw bad("deck may contain at most 200 cards");
  const normalizeId = (value: unknown, field: string): string => {
    if (typeof value !== "string") throw bad(`${field} must be a card id`);
    const id = value.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{1,32}$/.test(id)) throw bad(`${field} is not a valid card id`);
    return id;
  };
  return {
    leaderId: normalizeId(o.leaderId, "leaderId"),
    deck: o.deck.map((id) => normalizeId(id, "deck entry")),
  };
}

/** Parse client → server cosmetics update (artPrefs for the sender's seat). */
export function parseCosmeticsMessage(raw: unknown): ArtPrefsMap {
  const o = expectEnvelope(raw, "cosmetics message");
  return asArtPrefsMap(o.artPrefs);
}

function asArtPrefsMap(raw: unknown): ArtPrefsMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw bad("artPrefs object required");
  const out: ArtPrefsMap = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k !== "string" || !k.trim()) continue;
    if (typeof v !== "string" || !v.trim()) continue;
    // Bound size so cosmetics cannot bloat room memory.
    if (Object.keys(out).length >= 200) break;
    out[k.trim()] = v.trim();
  }
  return out;
}

/** Validates an inbound chat body and returns the cleaned text. */
export function parseChatMessage(raw: unknown): string {
  const o = expectEnvelope(raw, "chat message");
  if (typeof o.text !== "string") throw bad("chat text required");
  // Collapse whitespace and drop control characters so a line can't break layout.
  const text = o.text
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CHAT_MAX_LENGTH);
  if (!text) throw bad("chat text is empty");
  return text;
}

/** Validates an inbound hand_order body and returns the ids. */
export function parseHandOrderMessage(raw: unknown): string[] {
  const ids = raw && typeof raw === "object" ? (raw as Record<string, unknown>).ids : undefined;
  if (
    !Array.isArray(ids) ||
    ids.length > HAND_ORDER_MAX_IDS ||
    ids.some((id) => typeof id !== "string" || id.length > HAND_ORDER_MAX_ID_LENGTH)
  ) {
    throw bad("hand_order needs an ids array of short strings");
  }
  return ids as string[];
}

export function parseRematchMessage(raw: unknown): { action: RematchAction; deck?: PlayerDeckWire } {
  const o = expectEnvelope(raw, "rematch message");
  if (o.action !== "request" && o.action !== "decline" && o.action !== "first" && o.action !== "second") {
    throw bad("rematch action must be request|decline|first|second");
  }
  if (o.deck === undefined || o.deck === null) return { action: o.action };
  if (o.action !== "request") throw bad("rematch deck is only allowed with action request");
  return { action: o.action, deck: asPlayerDeck(o.deck) };
}

export function parseUndoMessage(raw: unknown): UndoRequestBody {
  const o = expectEnvelope(raw, "undo message");
  if (
    o.action !== "request" &&
    o.action !== "accept" &&
    o.action !== "decline" &&
    o.action !== "cancel"
  ) {
    throw bad("undo action must be request|accept|decline|cancel");
  }
  if (o.scope !== undefined && o.scope !== "action" && o.scope !== "turn") throw bad("undo scope must be action|turn");
  if (o.force !== undefined && typeof o.force !== "boolean") throw bad("undo force must be a boolean");
  if (o.id !== undefined && (typeof o.id !== "number" || !Number.isSafeInteger(o.id))) {
    throw bad("undo id must be an integer");
  }
  return {
    action: o.action,
    scope: o.scope ?? "action",
    force: o.force === true,
    ...(o.id === undefined ? {} : { id: o.id }),
  };
}

/** Validates an inbound dice message (#1190). */
export function parseDiceMessage(raw: unknown): DiceAction {
  const o = expectEnvelope(raw, "dice message");
  if (o.action === "call") {
    if (o.call !== "high" && o.call !== "low") throw bad("dice call must be high|low");
    return { action: "call", call: o.call };
  }
  if (o.action === "roll" || o.action === "first" || o.action === "second") return { action: o.action };
  throw bad("dice action must be call|roll|first|second");
}
