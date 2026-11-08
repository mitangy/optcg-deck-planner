/**
 * The player's imported OPTCGSim games (#1030): a list with a matchup summary, and a turn-by-turn
 * review read from the stored combat log by the OPTCGSim reader.
 *
 * Same shape family as review_match (narrateReplay): yourLeader, decks, result, finalState, log, notes.
 * What the player could see is all the review names: their own hand each turn, and for the opponent
 * only the cards the reader marks as publicly known (knownHandIds). The opponent's face-down draws
 * are never listed, even though the raw log prints their ids.
 */
import { parseSimGame } from "@optcg/rules/src/sim/optcgsim";
import type { SimBoardSnapshot, SimEvent, SimGame, SimSide } from "@optcg/rules/src/sim/optcgsim";
import { getCardDef } from "@optcg/rules";
import { cardName, DEFAULT_MAX_LINES, getSimGame, listMySimGames, simMatchups, type NarrateOptions, type PlannerApi, type SimGameDetail } from "./matches";

/** The placeholders the planner stores in place of both players' names. */
const ME = "Me#1";
const OPP = "Opp#2";

const who = (s: SimSide | null) => (s === "me" ? "You" : s === "opp" ? "Opponent" : "Someone");
const name = (id: string | null) => (id ? (cardName(id) ?? id) : "a card");

/** "4xOP01-001" lines as id, name and copies, sorted by card number. */
export function simDeckList(entries: readonly string[]) {
  const out: { id: string; name: string | null; copies: number }[] = [];
  for (const e of entries) {
    const m = /^(\d+)x(.+)$/.exec(e);
    if (m) out.push({ id: m[2]!, name: cardName(m[2]!), copies: Number(m[1]) });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

const handCard = (id: string) => {
  try {
    const counter = getCardDef(id).counter;
    return counter ? `${name(id)} (counter ${counter})` : name(id);
  } catch {
    return name(id);
  }
};

/** One line for a reader event, or null for events that add nothing (draws are in the hand lines). */
export function describeSimEvent(e: SimEvent): string | null {
  switch (e.kind) {
    case "play":
      return `${who(e.side)} played ${name(e.cardId)}${e.zone === "stage" ? " (stage)" : ""}.`;
    case "attachDon":
      return `${who(e.side)} attached ${e.count} DON!! to ${name(e.targetId)} (${e.total} total).`;
    case "attack":
      return `${who(e.side)} attacked ${name(e.targetId)} with ${name(e.attackerId)}.`;
    case "battle":
      return `Battle: ${name(e.attackerId)} (${e.attackerPower}) vs ${name(e.targetId)} (${e.targetPower}).`;
    case "block":
      return `${who(e.side)} blocked with ${name(e.blockerId)}.`;
    case "counter":
      return `${who(e.side)} countered${e.cardId ? ` with ${name(e.cardId)}` : ""}${e.value ? ` (+${e.value})` : ""}${e.via === "effect" ? " by effect" : ""}.`;
    case "damage":
      return `${name(e.sourceId)} dealt ${e.amount} damage.`;
    case "attackFails":
      return "The attack failed.";
    case "lifeTaken":
      return `${who(e.side)} lost a Life card (${name(e.cardId)}) to ${e.to}.`;
    case "ko":
      return `${who(e.side)}'s ${name(e.cardId)} was K.O.'d.`;
    case "trash":
      return e.from === "deck" || e.from === "life" ? null : `${who(e.side)} trashed ${name(e.cardId)} from ${e.from}.`;
    case "effect":
      return `${name(e.sourceId)}: ${e.text}`;
    case "result":
      return `Result: ${who(e.side)} ${e.what}.`;
    case "info":
      return e.text;
    case "endTurn":
      return `${who(e.side)} ended the turn.`;
    default:
      return null; // draws, DON!! draws, setup and unparsed lines
  }
}

/** One side's board on a line, like review_match's board lines. Power is the card's printed power plus any change in play. */
function boardLine(b: SimBoardSnapshot, label: string): string {
  const printed = (id: string) => {
    try {
      return getCardDef(id).power ?? 0;
    } catch {
      return 0;
    }
  };
  const piece = (id: string | null, rested: boolean, don: number, delta = 0) =>
    [name(id), id ? String(printed(id) + delta) : "", rested ? "rested" : "", don ? `+${don} DON!!` : ""].filter(Boolean).join(" ");
  return (
    `${label} board: Leader ${piece(b.leader.id, b.leader.rested, b.leader.attachedDon)}; ` +
    `Characters: ${b.characters.map((c) => piece(c.id, c.rested, c.attachedDon, c.powerDelta)).join(", ") || "none"}; ` +
    `Stage: ${b.stage ? name(b.stage) : "none"}. ` +
    `Life ${b.lifeCount}, deck ${b.deckCount}, DON!! ${b.donActive} active / ${b.donRested} rested / ${b.donDeckCount} in DON!! deck, trash ${b.trashIds.length}.`
  );
}

/** The imported game as a turn-by-turn log from the player's seat. */
export function narrateSimGame(game: SimGame, opts: NarrateOptions = {}) {
  const fromTurn = opts.fromTurn ?? 1;
  const toTurn = opts.toTurn ?? Number.POSITIVE_INFINITY;
  const maxLines = opts.maxLines ?? DEFAULT_MAX_LINES;
  const log: string[] = [];
  let truncated = false;
  const push = (line: string) => {
    if (log.length >= maxLines) truncated = true;
    else log.push(line);
  };
  const seen = new Set<string>();
  for (const turn of game.turns) {
    const mine = turn.snapshot.me;
    const theirs = turn.snapshot.opp;
    // Ids that sat in a visible zone: both leaders, boards and trash, and the player's own hand.
    for (const b of [mine, theirs]) {
      if (b.leader.id) seen.add(b.leader.id);
      for (const c of b.characters) seen.add(c.id);
      if (b.stage) seen.add(b.stage);
      for (const id of b.trashIds) seen.add(id);
    }
    for (const id of mine.knownHandIds) seen.add(id);
    if (turn.number < fromTurn || turn.number > toTurn) continue;
    push(`--- Turn ${turn.number} (${turn.active === "me" ? "your" : "opponent's"} turn) ---`);
    push(`Your hand after the draw: ${mine.knownHandIds.map(handCard).join(", ") || "empty"}.`);
    // Only cards the player saw go public before entering the hand are named; the rest of the hand is a count.
    push(
      `Opponent's hand: ${theirs.handCount} cards; known to you: ${theirs.knownHandIds.map(handCard).join(", ") || "none"} (the rest were drawn face down).`,
    );
    push(boardLine(mine, "Your"));
    push(boardLine(theirs, "Opponent's"));
    for (const e of turn.events) {
      const line = describeSimEvent(e);
      if (line) push(line);
    }
  }
  const last = game.turns[game.turns.length - 1];
  const finalBoard = (b: SimBoardSnapshot | undefined) => ({ life: b?.lifeCount ?? null, board: (b?.characters ?? []).map((c) => name(c.id)), handSize: b?.handCount ?? null });
  const mineEnd = finalBoard(last?.snapshot.me);
  const oppEnd = finalBoard(last?.snapshot.opp);
  const deck = (p: SimGame["me"]) => simDeckList(p.decklist.map((d) => `${d.count}x${d.id}`));
  return {
    wentFirst: game.firstPlayer === "me",
    yourLeader: name(game.me.leaderId),
    opponentLeader: name(game.opp.leaderId),
    yourLeaderId: game.me.leaderId,
    opponentLeaderId: game.opp.leaderId,
    yourDeck: deck(game.me),
    // Imported games are finished, so the opponent's list is shown, as review_match does for a finished duel.
    opponentDeck: deck(game.opp),
    cardsInGame: [...seen],
    result: game.winner ? { won: game.winner === "me", reason: "OPTCGSim result" } : null,
    finalState: {
      turn: last?.number ?? 0,
      yourLife: mineEnd.life,
      opponentLife: oppEnd.life,
      yourBoard: mineEnd.board,
      opponentBoard: oppEnd.board,
      yourHandSize: mineEnd.handSize,
      opponentHandSize: oppEnd.handSize,
      note: "State at the start of the last logged turn; a log can end mid-game, and the result comes from OPTCGSim.",
    },
    log,
    truncated,
    notes: [
      "This game was played on OPTCGSim and imported by the player; it is not a duel on optcgduel.app. The log comes from OPTCGSim's combat log, not the duel engine.",
      "Each turn lists your hand after the draw and both boards (power as printed plus changes in play, rested, attached DON!!, Life, deck, DON!!, trash). The opponent's hand is a count plus only the cards you saw go public before they entered it; their face-down draws are not named, and neither is their opening hand.",
      ...(game.unknownLines.length ? [`${game.unknownLines.length} log lines were not understood and are left out.`] : []),
      ...(truncated ? [`Log cut at ${maxLines} lines; ask for a turn range with fromTurn/toTurn.`] : []),
    ],
  };
}

/** The reader's input for a stored game. Names are the placeholders the planner stored; the log is what was kept. */
export function simRecord(row: SimGameDetail) {
  return {
    matchKey: row.id,
    date: row.played_at ?? undefined,
    playerName: ME,
    oppPlayerName: OPP,
    playerLeader: row.my_leader ?? undefined,
    oppLeader: row.opp_leader ?? undefined,
    decklist: row.my_deck,
    oppDecklist: row.opp_deck,
    result: row.result,
    turnNumber: row.turns ?? undefined,
    turnOrder: row.went_first === null ? undefined : row.went_first ? 0 : 1,
    combatLog: row.combat_log,
  };
}

export async function reviewSimGame(api: PlannerApi, token: string, id: string, opts: NarrateOptions = {}) {
  const row = await getSimGame(api, token, id);
  if (!row.combat_log) throw new Error("This game was imported without a combat log, so it can't be replayed. The result and decks are in list_my_sim_games.");
  const game = parseSimGame(simRecord(row));
  return { gameId: row.id, source: "optcgsim", playedAt: row.played_at, ...narrateSimGame(game, opts) };
}

export async function listMySimGamesSummary(api: PlannerApi, token: string, limit = 20) {
  const [{ games, total }, matchups] = await Promise.all([listMySimGames(api, token, limit), simMatchups(api, token)]);
  return {
    note: "These are OPTCGSim games the player imported (not optcgduel.app duels). Use review_sim_game with an id to read one. Records are the player's own and small samples: say how many games each is based on.",
    total,
    games: games.map((g) => ({ ...g, my_leader_name: g.my_leader ? cardName(g.my_leader) : null, opp_leader_name: g.opp_leader ? cardName(g.opp_leader) : null })),
    matchups: matchups.map((m) => ({ ...m, my_leader_name: m.my_leader ? cardName(m.my_leader) : null, opp_leader_name: m.opp_leader ? cardName(m.opp_leader) : null })),
  };
}
