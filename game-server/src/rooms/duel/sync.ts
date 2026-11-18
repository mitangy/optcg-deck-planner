import type { Client } from "colyseus";
import type { BotLevel, Seat } from "@optcg/rules";
import { mintBriefTicket } from "../../briefTicket.js";
import {
  type BriefTicketWire,
  type SeatPlayerInfo,
  type WelcomeMessage,
} from "../../protocol.js";
import type { DuelCore, WireBody } from "./context.js";

export class SyncSender {
  constructor(
    private readonly core: Pick<
      DuelCore,
      "game" | "io" | "clocks" | "undo" | "chat" | "rematch" | "spectators" | "cosmetics" | "seats" | "dice"
    >,
  ) {}

  private botInfo(): { bot: { level: BotLevel } } | Record<string, never> {
    const bot = this.core.game.bot;
    return bot ? { bot: { level: bot.level } } : {};
  }

  playersInfo(): [SeatPlayerInfo, SeatPlayerInfo] {
    const { game } = this.core;
    const info = (seat: Seat): SeatPlayerInfo => ({
      name: this.core.seats.slot(seat)?.displayName ?? game.seatNames[seat] ?? null,
    });
    return [info(0), info(1)];
  }

  private briefFor(seat: Seat): BriefTicketWire | undefined {
    const { game } = this.core;
    if (game.competitive || !game.replay) return undefined;
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

  sendPlayerStart(client: Client, seat: Seat) {
    const { game, io, spectators, cosmetics, chat, undo } = this.core;
    const view = spectators.playerView(game.match!, seat);
    const welcome: WireBody<WelcomeMessage> = {
      matchId: game.matchId,
      seat,
      role: "player",
      view,
      players: this.playersInfo(),
      ranked: game.ranked,
      tournament: game.tournament,
      firstSeatPickedBy: game.firstSeatPickedBy,
      brief: this.briefFor(seat),
      dice: game.dice,
      ...this.botInfo(),
    };
    io.send(client, "welcome", welcome);
    io.send(client, "view", { view });
    cosmetics.sendStored(client);
    chat.sendHistory(client);
    undo.sendState(client);
  }

  sendSync(client: Client) {
    const { game, io, clocks, rematch, seats, spectators } = this.core;
    const spec = spectators.forClient(client);
    if (spec) {
      this.sendSpectatorSync(client, spec.cameraSeat);
      return;
    }
    const seat = seats.seatForClient(client);
    if (seat === null || !game.match) {
      this.sendNoMatch(client);
      return;
    }
    this.sendPlayerStart(client, seat);
    io.send(client, "timer", clocks.timerPayload());
    io.send(client, "presence", { awayUntil: seats.awayUntil() });
    if (game.match.winner !== null && game.matchOverSent) {
      this.sendMatchOver(client);
      if (!game.ranked) io.send(client, "rematch_state", rematch.state());
    }
  }

  private sendNoMatch(client: Client) {
    if (this.core.dice.sendState(client)) return;
    this.core.io.sendError(client, "match_not_ready", "Match not started");
  }

  sendSpectatorSync(client: Client, cameraSeat: Seat) {
    const { game, io, spectators, cosmetics, chat } = this.core;
    if (!game.match) {
      this.sendNoMatch(client);
      return;
    }
    const view = spectators.spectatorView(game.match, cameraSeat);
    const welcome: WireBody<WelcomeMessage> = {
      matchId: game.matchId,
      seat: cameraSeat,
      ...this.botInfo(),
      dice: game.dice,
      role: "spectator",
      view,
      players: this.playersInfo(),
      ranked: game.ranked,
      tournament: game.tournament,
      firstSeatPickedBy: game.firstSeatPickedBy,
    };
    io.send(client, "welcome", welcome);
    io.send(client, "view", { view });
    cosmetics.sendStored(client);
    chat.sendHistory(client);
    if (game.match.winner !== null && game.matchOverSent) this.sendMatchOver(client);
  }

  private sendMatchOver(client: Client) {
    const { game } = this.core;
    this.core.io.send(client, "match_over", {
      result: {
        winner: game.match!.winner,
        reason: game.endReason ?? game.match!.winReason ?? "unknown",
      },
    });
  }
}
