import type { Client } from "colyseus";
import type { Seat } from "@optcg/rules";
import { gameSeed } from "../../matchmakeGuard.js";
import { assertKnownDeck } from "../../rankedDeck.js";
import {
  PROTOCOL_VERSION,
  parseRematchMessage,
  type PlayerDeckWire,
  type RematchAction,
  type RematchStateMessage,
} from "../../protocol.js";
import { BOT_SEAT, botPacing } from "./bots.js";
import type { DuelCore } from "./context.js";

/** The rematch handshake after a private game: both agree, the loser picks the turn order, a fresh game starts. */
export class Rematch {
  private rematchRequested: [boolean, boolean] = [false, false];
  private rematchDeclinedBy: Seat | null = null;
  /** Deck each seat picked with its rematch request (null: keep the current deck). */
  private rematchDecks: [PlayerDeckWire | null, PlayerDeckWire | null] = [null, null];

  constructor(private readonly core: Pick<DuelCore, "game" | "io" | "time" | "startMatch">) {}

  /** Clear everything tied to one game so a rematch starts clean. */
  resetPerGameState() {
    this.rematchRequested = [false, false];
    this.rematchDeclinedBy = null;
    this.rematchDecks = [null, null];
  }

  state(): RematchStateMessage {
    const { game } = this.core;
    const available =
      !game.ranked &&
      game.matchOverSent &&
      game.match?.winner != null &&
      game.seats[0] != null &&
      game.seats[1] != null;
    const both = this.rematchRequested[0] && this.rematchRequested[1];
    return {
      protocolVersion: PROTOCOL_VERSION,
      available,
      requested: [...this.rematchRequested],
      newDeck: [this.rematchDecks[0] != null, this.rematchDecks[1] != null],
      declinedBy: this.rematchDeclinedBy,
      chooser: available && both && game.match?.winner != null ? ((1 - game.match.winner) as Seat) : null,
    };
  }

  broadcast() {
    // Ranked rooms never offer a rematch, so clients never show the option.
    if (!this.core.game.matchOverSent || this.core.game.ranked) return;
    this.core.io.broadcast("rematch_state", this.state());
  }

  handle(client: Client, seat: Seat, message: unknown) {
    const { game, io } = this.core;
    let action: RematchAction;
    let deck: PlayerDeckWire | undefined;
    try {
      ({ action, deck } = parseRematchMessage(message));
      if (deck) assertKnownDeck(deck);
    } catch (e) {
      io.sendParseError(client, e);
      return;
    }
    const state = this.state();
    if (!state.available) {
      io.sendError(
        client,
        game.ranked ? "unauthorized" : "match_not_ready",
        game.ranked ? "Rematch is only available in private matches" : "Rematch isn't available right now",
      );
      return;
    }
    switch (action) {
      case "request":
        this.rematchRequested[seat] = true;
        this.rematchDecks[seat] = deck ?? null;
        this.rematchDeclinedBy = null;
        // The bot always agrees (and keeps its deck), and picks the turn order if it lost.
        if (game.bot) this.rematchRequested[BOT_SEAT] = true;
        this.broadcast();
        this.botPickOrder();
        return;
      case "decline":
        this.rematchRequested = [false, false];
        this.rematchDecks = [null, null];
        this.rematchDeclinedBy = seat;
        this.broadcast();
        return;
      case "first":
      case "second": {
        if (state.chooser !== seat) {
          io.sendError(client, "unauthorized", "The player who lost chooses the turn order");
          return;
        }
        this.start(seat, action);
        return;
      }
    }
  }

  /** `chooser` (the loser of the last game) picked the turn order; start the next game. */
  private start(chooser: Seat, action: "first" | "second") {
    const { game, io } = this.core;
    const firstSeat: Seat = action === "first" ? chooser : ((1 - chooser) as Seat);
    game.seed = gameSeed();
    io.log("info", "rematch_start", {
      matchId: game.matchId,
      game: game.gameNumber + 1,
      firstSeat,
      newDeck: [this.rematchDecks[0] != null, this.rematchDecks[1] != null],
    });
    for (const s of [0, 1] as const) {
      const picked = this.rematchDecks[s];
      if (picked) game.seatDecks[s] = picked;
    }
    this.core.startMatch(firstSeat, chooser);
  }

  /** The bot lost the last game and both agreed to a rematch: it goes first. */
  private botPickOrder() {
    if (!this.core.game.bot || this.state().chooser !== BOT_SEAT) return;
    this.core.time.setTimeout(() => {
      if (this.state().chooser !== BOT_SEAT) return;
      this.start(BOT_SEAT, "first");
    }, botPacing.choiceMs);
  }
}
