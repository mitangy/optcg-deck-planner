import type { Client } from "colyseus";
import type { BotLevel, Seat } from "@optcg/rules";
import { mintBriefTicket } from "../../briefTicket.js";
import {
  PROTOCOL_VERSION,
  type BriefTicketWire,
  type SeatPlayerInfo,
  type WelcomeMessage,
} from "../../protocol.js";
import type { DuelCore } from "./context.js";

/** Brings one client up to date: the welcome, its view and everything stored for it (join, sync, reconnect). */
export class SyncSender {
  constructor(
    private readonly core: Pick<
      DuelCore,
      "game" | "io" | "clocks" | "undo" | "chat" | "rematch" | "spectators" | "cosmetics" | "seatForClient"
    >,
  ) {}

  private botInfo(): { bot: { level: BotLevel } } | Record<string, never> {
    const bot = this.core.game.bot;
    return bot ? { bot: { level: bot.level } } : {};
  }

  /** Seat-indexed public names for nameplates / results (never emails). */
  playersInfo(): [SeatPlayerInfo, SeatPlayerInfo] {
    const { game } = this.core;
    const info = (seat: Seat): SeatPlayerInfo => ({
      name: game.seats[seat]?.displayName ?? game.seatNames[seat] ?? null,
    });
    return [info(0), info(1)];
  }

  /**
   * The matchup-brief ticket for a player seat: that seat's own leader and deck
   * against the other seat's leader. Never minted for a ranked room.
   */
  private briefFor(seat: Seat): BriefTicketWire | undefined {
    const { game } = this.core;
    if (game.ranked || !game.replay) return undefined;
    const mine = game.replay.players[seat];
    const theirs = game.replay.players[1 - seat];
    const ticket = mintBriefTicket({
      mid: game.gameKey(),
      seat,
      ranked: game.ranked,
      leader: mine.leaderId,
      opponent: theirs.leaderId,
      deck: mine.deck,
    });
    if (!ticket) return undefined;
    return { ticket, leaderId: mine.leaderId, opponentId: theirs.leaderId, deck: [...mine.deck] };
  }

  /** Welcome, view, stored cosmetics, chat history and undo state for a seated player: what a new game opens with. */
  sendPlayerStart(client: Client, seat: Seat) {
    const { game, spectators, cosmetics, chat, undo } = this.core;
    const view = spectators.playerView(game.match!, seat);
    const welcome: WelcomeMessage = {
      protocolVersion: PROTOCOL_VERSION,
      matchId: game.matchId,
      seat,
      role: "player",
      view,
      players: this.playersInfo(),
      ranked: game.ranked,
      firstSeatPickedBy: game.firstSeatPickedBy,
      brief: this.briefFor(seat),
      ...this.botInfo(),
    };
    client.send("welcome", welcome);
    client.send("view", {
      protocolVersion: PROTOCOL_VERSION,
      view,
    });
    cosmetics.sendStored(client);
    chat.sendHistory(client);
    undo.sendState(client);
  }

  /** Re-send everything the client needs to render the room (the "sync" message, a join, a reconnect). */
  sendSync(client: Client) {
    const { game, io, clocks, rematch, spectators } = this.core;
    const spec = spectators.forClient(client);
    if (spec) {
      this.sendSpectatorSync(client, spec.cameraSeat);
      return;
    }
    const seat = this.core.seatForClient(client);
    if (seat === null || !game.match) {
      io.sendError(client, "match_not_ready", "Match not started");
      return;
    }
    this.sendPlayerStart(client, seat);
    client.send("timer", clocks.timerPayload());
    client.send("presence", { protocolVersion: PROTOCOL_VERSION, awayUntil: [...game.awayUntil] });
    if (game.match.winner !== null && game.matchOverSent) {
      this.sendMatchOver(client);
      if (!game.ranked) client.send("rematch_state", rematch.state());
    }
  }

  sendSpectatorSync(client: Client, cameraSeat: Seat) {
    const { game, io, spectators, cosmetics, chat } = this.core;
    if (!game.match) {
      io.sendError(client, "match_not_ready", "Match not started");
      return;
    }
    const view = spectators.spectatorView(game.match, cameraSeat);
    const welcome: WelcomeMessage = {
      protocolVersion: PROTOCOL_VERSION,
      matchId: game.matchId,
      seat: cameraSeat,
      ...this.botInfo(),
      role: "spectator",
      view,
      players: this.playersInfo(),
      ranked: game.ranked,
      firstSeatPickedBy: game.firstSeatPickedBy,
    };
    client.send("welcome", welcome);
    client.send("view", {
      protocolVersion: PROTOCOL_VERSION,
      view,
    });
    cosmetics.sendStored(client);
    chat.sendHistory(client);
    if (game.match.winner !== null && game.matchOverSent) this.sendMatchOver(client);
  }

  private sendMatchOver(client: Client) {
    const { game } = this.core;
    client.send("match_over", {
      protocolVersion: PROTOCOL_VERSION,
      result: {
        winner: game.match!.winner,
        reason: game.endReason ?? game.match!.winReason ?? "unknown",
      },
    });
  }
}
