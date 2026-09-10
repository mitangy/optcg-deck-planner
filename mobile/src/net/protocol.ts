/**
 * Wire types for protocolVersion 1 — mirrored from game-server/src/protocol.ts.
 * Do not import @optcg/rules into the app.
 */

import { lookupCard } from "../cards/atlas";

export const PROTOCOL_VERSION = 1 as const;
export type ProtocolVersion = typeof PROTOCOL_VERSION;

export type Seat = 0 | 1;

export type DuelJoinOptions = {
  protocolVersion: ProtocolVersion;
  devUserId: string;
  secret?: string;
  preferredSeat?: Seat;
};

export type DuelCreateOptions = {
  protocolVersion?: ProtocolVersion;
  seed?: number;
  autoSkipMulligan?: boolean;
  players?: [{ leaderId: string; deck: string[] }, { leaderId: string; deck: string[] }];
};

/** Prefer sending objects from view.legalIntents unchanged. */
export type Intent = Record<string, unknown> & { type: string };

export type ErrorCode =
  | "illegal_intent"
  | "match_not_ready"
  | "match_over"
  | "bad_protocol"
  | "rate_limited"
  | "unauthorized"
  | "room_full"
  | string;

export type WelcomeMessage = {
  protocolVersion: ProtocolVersion;
  matchId: string;
  seat: Seat;
  view: PlayerView;
};

export type ViewMessage = {
  protocolVersion: ProtocolVersion;
  view: PlayerView;
};

export type EventsMessage = {
  protocolVersion: ProtocolVersion;
  events: unknown[];
};

export type ErrorMessage = {
  protocolVersion: ProtocolVersion;
  code: ErrorCode;
  message: string;
};

export type MatchOverMessage = {
  protocolVersion: ProtocolVersion;
  result: {
    winner: Seat;
    reason: string;
  };
};

export type CardView = {
  id: string;
  defId: string;
  rested?: boolean;
  attachedDonCount?: number;
  power?: number;
};

export type PlayerView = {
  seat: Seat;
  you: {
    leader: CardView;
    characters: CardView[];
    stage: CardView | null;
    hand: { id: string; defId: string }[];
    deckCount: number;
    trash: string[];
    lifeCount: number;
    donDeckCount: number;
    costArea: { id: string; rested: boolean }[];
    activeDonCount: number;
    mulliganDone?: boolean;
    turnsStarted?: number;
  };
  opponent: {
    leader: CardView;
    characters: CardView[];
    stage: CardView | null;
    handCount: number;
    deckCount: number;
    trash: string[];
    lifeCount: number;
    donDeckCount: number;
    costAreaCount: number;
    activeDonCount: number;
    turnsStarted?: number;
  };
  activeSeat: Seat;
  phase: string;
  turnNumber: number;
  battle: unknown;
  pendingTrigger: unknown;
  winner: Seat | null;
  winReason: string | null;
  legalIntents: Intent[];
};

export function isProtocolVersion(v: unknown): v is ProtocolVersion {
  return v === PROTOCOL_VERSION;
}

export function assertNoOpponentHand(view: PlayerView): void {
  const opp = view.opponent as PlayerView["opponent"] & { hand?: unknown };
  if (Object.prototype.hasOwnProperty.call(opp, "hand") && opp.hand !== undefined) {
    throw new Error("privacy leak: opponent.hand present in view");
  }
  if (typeof opp.handCount !== "number") {
    throw new Error("opponent.handCount missing");
  }
}

export function parseWelcome(raw: unknown): WelcomeMessage {
  if (!raw || typeof raw !== "object") throw new Error("welcome body required");
  const o = raw as Record<string, unknown>;
  if (!isProtocolVersion(o.protocolVersion)) throw new Error("bad protocolVersion");
  if (typeof o.matchId !== "string") throw new Error("matchId required");
  if (o.seat !== 0 && o.seat !== 1) throw new Error("seat required");
  if (!o.view || typeof o.view !== "object") throw new Error("view required");
  const view = o.view as PlayerView;
  assertNoOpponentHand(view);
  return {
    protocolVersion: PROTOCOL_VERSION,
    matchId: o.matchId,
    seat: o.seat,
    view,
  };
}

export function parseView(raw: unknown): ViewMessage {
  if (!raw || typeof raw !== "object") throw new Error("view body required");
  const o = raw as Record<string, unknown>;
  if (!isProtocolVersion(o.protocolVersion)) throw new Error("bad protocolVersion");
  if (!o.view || typeof o.view !== "object") throw new Error("view required");
  const view = o.view as PlayerView;
  assertNoOpponentHand(view);
  return { protocolVersion: PROTOCOL_VERSION, view };
}

export function parseError(raw: unknown): ErrorMessage {
  if (!raw || typeof raw !== "object") throw new Error("error body required");
  const o = raw as Record<string, unknown>;
  return {
    protocolVersion: PROTOCOL_VERSION,
    code: typeof o.code === "string" ? o.code : "unknown",
    message: typeof o.message === "string" ? o.message : "Unknown error",
  };
}

export function parseMatchOver(raw: unknown): MatchOverMessage {
  if (!raw || typeof raw !== "object") throw new Error("match_over body required");
  const o = raw as Record<string, unknown>;
  const result = o.result as { winner?: unknown; reason?: unknown } | undefined;
  if (!result || (result.winner !== 0 && result.winner !== 1)) {
    throw new Error("match_over.result.winner required");
  }
  return {
    protocolVersion: PROTOCOL_VERSION,
    result: {
      winner: result.winner,
      reason: typeof result.reason === "string" ? result.reason : "unknown",
    },
  };
}

function shortId(id: unknown): string {
  return String(id ?? "?").slice(0, 8);
}

function nameForDef(defId: string | undefined): string | null {
  if (!defId) return null;
  const n = lookupCard(defId).name;
  return n && n !== defId ? n : defId;
}

function findBoardName(view: PlayerView | undefined, instanceId: unknown): string {
  if (!view || instanceId == null) return shortId(instanceId);
  const id = String(instanceId);
  if (view.you.leader.id === id) return nameForDef(view.you.leader.defId) ?? shortId(id);
  const ch = view.you.characters.find((c) => c.id === id);
  if (ch) return nameForDef(ch.defId) ?? shortId(id);
  if (view.opponent.leader.id === id) {
    return nameForDef(view.opponent.leader.defId) ?? shortId(id);
  }
  const och = view.opponent.characters.find((c) => c.id === id);
  if (och) return nameForDef(och.defId) ?? shortId(id);
  return shortId(id);
}

function handName(view: PlayerView | undefined, handIndex: unknown): string {
  if (!view || typeof handIndex !== "number") return `#${String(handIndex)}`;
  const card = view.you.hand[handIndex];
  if (!card) return `#${handIndex}`;
  return nameForDef(card.defId) ?? `#${handIndex}`;
}

export function intentLabel(intent: Intent, view?: PlayerView): string {
  switch (intent.type) {
    case "mulligan":
      return intent.doMulligan ? "Mulligan" : "Keep hand";
    case "play_card":
      return `Play ${handName(view, intent.handIndex)}`;
    case "give_don":
      return `Give DON → ${findBoardName(view, intent.targetId)}`;
    case "activate_leader":
      return `Activate Leader → ${findBoardName(view, intent.targetId)}`;
    case "declare_attack": {
      const target = intent.target as { kind?: string; instanceId?: string } | undefined;
      if (target?.kind === "leader") {
        return `Attack Leader (${findBoardName(view, view?.opponent.leader.id)})`;
      }
      if (target?.kind === "character") {
        return `Attack ${findBoardName(view, target.instanceId)}`;
      }
      return `Attack ${JSON.stringify(intent.target)}`;
    }
    case "declare_block":
      return `Block (${findBoardName(view, intent.blockerId)})`;
    case "pass_block":
      return "Pass block";
    case "counter_from_hand":
      return `Counter ${handName(view, intent.handIndex)}`;
    case "counter_event":
      return `Counter event ${handName(view, intent.handIndex)}`;
    case "pass_counter":
      return "Pass counter";
    case "resolve_trigger":
      return intent.accept ? "Accept Trigger" : "Decline Trigger";
    case "end_turn":
      return "End turn";
    default:
      return intent.type;
  }
}
