import type { Client } from "colyseus";
import { getPlayerView, getSpectatorView, projectGameEvents, type GameEvent, type MatchState, type Seat } from "@optcg/rules";
import { applyHandOrder, idsInHand } from "../../handOrder.js";
import { presence } from "../../presence.js";
import { parseHandOrderMessage } from "../../protocol.js";
import type { DuelCore, SpectatorSlot } from "./context.js";

export const MAX_SPECTATORS = 8;

/** Who is watching, and every view the room sends out: each seat's private view and the spectators' public one. */
export class Spectators {
  private slots: SpectatorSlot[] = [];
  /**
   * Each player's own hand order (instance ids), shown to spectators of unranked
   * rooms. Never sent to a player: neither seat learns anything it can't see.
   */
  private seatHandOrder: [string[], string[]] = [[], []];

  constructor(private readonly core: Pick<DuelCore, "game" | "io" | "cosmetics" | "seats">) {}

  get list(): readonly SpectatorSlot[] {
    return this.slots;
  }

  get count(): number {
    return this.slots.length;
  }

  forClient(client: Client): SpectatorSlot | null {
    return this.slots.find((s) => s.sessionId === client.sessionId) ?? null;
  }

  /** Seat a spectator; false when the room is at its cap. */
  join(client: Client, identity: { displayId: string; userId: number; cameraSeat: Seat }): boolean {
    if (this.slots.length >= MAX_SPECTATORS) return false;
    this.slots.push({
      sessionId: client.sessionId,
      displayId: identity.displayId,
      userId: identity.userId,
      cameraSeat: identity.cameraSeat,
    });
    presence.markDirty();
    this.core.io.log("info", "spectator_joined", {
      matchId: this.core.game.matchId,
      displayId: identity.displayId,
      cameraSeat: identity.cameraSeat,
      sessionId: client.sessionId,
      spectatorCount: this.slots.length,
    });
    return true;
  }

  remove(sessionId: string) {
    const before = this.slots.length;
    this.slots = this.slots.filter((s) => s.sessionId !== sessionId);
    if (this.slots.length !== before) {
      presence.markDirty();
      this.core.io.log("info", "spectator_left", {
        matchId: this.core.game.matchId,
        sessionId,
        spectatorCount: this.slots.length,
      });
    }
  }

  resetPerGameState() {
    this.seatHandOrder = [[], []];
  }

  handleHandOrder(client: Client, seat: Seat, message: unknown) {
    const { game, io } = this.core;
    let ids: string[];
    try {
      ids = parseHandOrderMessage(message);
    } catch (e) {
      io.sendParseError(client, e);
      return;
    }
    // Ranked rooms never show hands to spectators, so there is nothing to keep.
    if (game.ranked || !game.match) return;
    const next = idsInHand(game.match.players[seat].hand, ids);
    const prev = this.seatHandOrder[seat];
    if (next.length === prev.length && next.every((id, i) => id === prev[i])) return;
    this.seatHandOrder[seat] = next;
    for (const spec of this.slots) {
      const specClient = io.clientFor(spec.sessionId);
      if (!specClient) continue;
      io.send(specClient, "view", { view: this.spectatorView(game.match, spec.cameraSeat) });
    }
  }

  /** Both hands in the order their players arranged them (#346, #482). */
  private orderedHands<H extends [{ id: string }[], { id: string }[]]>(hands: H): H {
    const [h0, h1] = hands;
    return [applyHandOrder(h0, this.seatHandOrder[0]), applyHandOrder(h1, this.seatHandOrder[1])] as unknown as H;
  }

  /** Player view; after game over the revealed hands follow each player's arranged order (#482). */
  playerView(match: MatchState, seat: Seat) {
    const view = getPlayerView(match, seat);
    if (!view.revealedHands) return view;
    return { ...view, revealedHands: this.orderedHands(view.revealedHands) };
  }

  /**
   * Spectators see both hands in unranked rooms. Ranked keeps hands hidden so a
   * spectator can't relay them to a player.
   */
  spectatorView(match: MatchState, cameraSeat: Seat) {
    const view = getSpectatorView(match, cameraSeat, { revealHands: !this.core.game.ranked });
    if (!view.revealedHands) return view;
    // Each hand in the order its player arranged it (see seatHandOrder).
    return { ...view, revealedHands: this.orderedHands(view.revealedHands) };
  }

  /** Send every connected seat and spectator its view of the current state, with the events that led to it. */
  broadcastViews(events: GameEvent[]) {
    const { game, io, cosmetics, seats } = this.core;
    if (!game.match) return;
    cosmetics.updatePublicArt(events);
    // Replay intents applied so far: lets clients drop battle-log lines on undo.
    const step = game.replay?.intents.length ?? 0;
    for (const slot of seats.all()) {
      if (!slot) continue;
      const client = io.clientFor(slot.sessionId);
      if (!client) continue;
      const view = this.playerView(game.match, slot.seat);
      io.send(client, "events", { events: projectGameEvents(events, slot.seat), step });
      io.send(client, "view", { view });
    }
    for (const spec of this.slots) {
      const client = io.clientFor(spec.sessionId);
      if (!client) continue;
      const view = this.spectatorView(game.match, spec.cameraSeat);
      io.send(client, "events", { events: projectGameEvents(events, null), step });
      io.send(client, "view", { view });
    }
  }
}
