/**
 * Where puzzle positions come from (#677): mid-game states sampled from bot self-play games (fixed seeds), and boards
 * built card by card with the rules Harness. Both are deterministic for a seed. A state is a position only when the
 * question can be answered from what the text shows: it is somebody's idle Main Phase, no choice is pending, and no
 * temporary effect or this-turn record the text could not show is in play.
 */
import { createSeededRng, listCardDefs, replayApply, replayStart, type MatchReplay, type MatchState, type Rng, type Seat } from "@optcg/rules";
import { playBotGame } from "@optcg/rules/src/sim/selfPlay";
import { randomDeck } from "@optcg/rules/src/sim/fuzz";
import { FILLER, Harness } from "@optcg/rules/src/testing/harness";
import type { Catalog } from "../../src/catalog";
import { NEW_SET } from "./types";

export type DeckSource = { name?: string; leaderId: string; deck: string[] };
export type Position = { id: string; state: MatchState; source: string; synthetic: boolean };

/** The active seat is in its Main Phase with nothing waiting: the state a player sees at the start of a decision. */
export function isIdleMain(state: MatchState): boolean {
  return state.winner === null && state.phase === "main" && !state.battle && !state.pendingChoices.length && !state.resolutionFrames.length && !state.triggerQueue.length && !state.steps.length;
}

/** Markers ("flag") only: no buff, keyword, restriction or cost change is in play that the position text would have to mention. */
export function plainState(state: MatchState): boolean {
  if (state.modifiers.some((m) => m.effect.type !== "flag")) return false;
  return state.players.every((p) => !p.turnLog || p.turnLog.turn !== state.turnNumber || (!p.turnLog.events.length && !p.turnLog.koed.length && !p.turnLog.handTrashed));
}

export function samplableState(state: MatchState): boolean {
  return isIdleMain(state) && plainState(state) && state.turnNumber >= 2;
}

/** Up to `perGame` distinct states of a replay that are positions, at most one per turn. */
export function samplePositions(replay: MatchReplay, rng: Rng, perGame: number, label: string): Position[] {
  const candidates: { i: number; turn: number }[] = [];
  let state = replayStart(replay);
  replay.intents.forEach((_, i) => {
    state = replayApply(state, replay, i).state;
    if (samplableState(state)) candidates.push({ i, turn: state.turnNumber });
  });
  const picked: { i: number; turn: number }[] = [];
  const turns = new Set<number>();
  for (const c of rng.shuffle([...candidates])) {
    if (picked.length >= perGame) break;
    if (turns.has(c.turn)) continue;
    turns.add(c.turn);
    picked.push(c);
  }
  picked.sort((a, b) => a.i - b.i);
  const want = new Set(picked.map((c) => c.i));
  const out: Position[] = [];
  state = replayStart(replay);
  replay.intents.forEach((_, i) => {
    state = replayApply(state, replay, i).state;
    if (want.has(i)) out.push({ id: `${label}-i${i}`, state, source: `selfplay seed ${replay.seed} intent ${i}`, synthetic: false });
  });
  return out;
}

type Def = ReturnType<typeof listCardDefs>[number];
const usable = (d: Def) => d.dataSource !== "stub";
const leaderDefs = () => listCardDefs().filter((d) => usable(d) && d.type === "leader" && d.life != null);

/** A deck built around cards of the newest sets: a new Leader (or any Leader) with four copies each of a few new cards of its colors. */
export function newSetDeck(rng: Rng, catalog: Catalog): DeckSource {
  const leaders = leaderDefs();
  const newLeaders = leaders.filter((d) => NEW_SET.test(d.id));
  const leader = rng.next() < 0.6 && newLeaders.length ? newLeaders[rng.nextInt(newLeaders.length)]! : leaders[rng.nextInt(leaders.length)]!;
  const pool = listCardDefs().filter((d) => usable(d) && d.type !== "leader" && NEW_SET.test(d.id) && d.colors.some((c) => leader.colors.includes(c)) && ["supported", "vanilla"].includes(catalog.cards.get(d.id)?.support ?? ""));
  const focus = rng.shuffle([...pool]).slice(0, 4).map((d) => d.id);
  return randomDeck(rng, focus, leader.id);
}

/**
 * Self-play games with fixed seeds, `perGame` positions from each. A game uses new-set decks with probability `newShare`
 * (both decks), otherwise the meta decks or random decks.
 */
export function selfPlayPositions(opts: { seed: number; games: number; perGame: number; newShare: number; decks?: DeckSource[]; catalog: Catalog }): Position[] {
  const out: Position[] = [];
  for (let g = 0; g < opts.games; g += 1) {
    const gameSeed = opts.seed * 100000 + g + 1;
    const rng = createSeededRng(gameSeed);
    const fresh = rng.next() < opts.newShare;
    const pick = (): DeckSource => (fresh ? newSetDeck(rng, opts.catalog) : opts.decks?.length ? opts.decks[rng.nextInt(opts.decks.length)]! : randomDeck(rng));
    const players: [DeckSource, DeckSource] = [pick(), pick()];
    const game = playBotGame({ seed: gameSeed, players: [{ leaderId: players[0].leaderId, deck: players[0].deck }, { leaderId: players[1].leaderId, deck: players[1].deck }], levels: ["normal", "normal"] });
    out.push(...samplePositions(game.replay, rng, opts.perGame, `sp${opts.seed}-g${g}`));
  }
  return out;
}

const cardPool = (catalog: Catalog, wantNew: boolean, types: string[]): Def[] =>
  listCardDefs().filter((d) => usable(d) && types.includes(d.type) && (!wantNew || NEW_SET.test(d.id)) && ["supported", "vanilla"].includes(catalog.cards.get(d.id)?.support ?? ""));

const pickOf = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.nextInt(xs.length)]!;

/**
 * A Harness board: Leaders, up to 5 Characters and maybe a Stage per side, DON!! attached to Leaders and Characters, a hand,
 * a trash, rested and just-played Characters. Seat 0 is in its Main Phase. With `wantNew`, most cards come from OP18 / EB05.
 */
export function syntheticPosition(rng: Rng, catalog: Catalog, wantNew: boolean, label: string): Position {
  const leaders = leaderDefs().filter((d) => ["supported", "vanilla"].includes(catalog.cards.get(d.id)?.support ?? ""));
  const newLeaders = leaders.filter((d) => NEW_SET.test(d.id));
  const leaderOf = () => (wantNew && newLeaders.length && rng.next() < 0.5 ? pickOf(rng, newLeaders) : pickOf(rng, leaders));
  const l0 = leaderOf();
  const l1 = leaderOf();
  const h = new Harness({ leaders: [l0.id, l1.id], seed: 1 + rng.nextInt(1_000_000) });
  const chars = cardPool(catalog, false, ["character"]);
  const newChars = cardPool(catalog, true, ["character"]);
  const anyCards = cardPool(catalog, false, ["character", "event", "stage"]);
  const newCards = cardPool(catalog, true, ["character", "event", "stage"]);
  const fromPool = (all: Def[], fresh: Def[]) => (wantNew && fresh.length && rng.next() < 0.6 ? pickOf(rng, fresh) : pickOf(rng, all));
  for (const seat of [0, 1] as Seat[]) {
    const p = h.state.players[seat];
    const leaderColors = p.leader && catalog.cards.get(p.leader.defId)?.colors ? catalog.cards.get(p.leader.defId)!.colors : [];
    const ofColor = (all: Def[]) => {
      const same = all.filter((d) => d.colors.some((c) => leaderColors.includes(c)));
      return same.length && rng.next() < 0.85 ? same : all;
    };
    const active = 1 + rng.nextInt(8);
    const rested = rng.nextInt(Math.min(4, 11 - active));
    h.don(seat, active, rested);
    const count = rng.nextInt(6);
    const onField = Array.from({ length: count }, () => fromPool(ofColor(chars), ofColor(newChars)).id);
    const placed = onField.length ? h.field(seat, ...onField) : [];
    for (const c of placed) {
      c.rested = rng.next() < 0.3;
      if (seat === 0 && rng.next() < 0.3) {
        c.summoningSick = true;
        c.playedTurn = h.state.turnNumber;
      }
    }
    if (rng.next() < 0.2) h.stage(seat, fromPool(cardPool(catalog, false, ["stage"]), cardPool(catalog, true, ["stage"])).id);
    // DON!! attached: the Leader sometimes, each Character now and then, as many as the DON!! deck can give.
    const budget = () => h.state.players[seat].donDeck.length;
    if (rng.next() < 0.5 && budget() > 0) h.attach(seat, p.leader, Math.min(budget(), 1 + rng.nextInt(3)));
    for (const c of placed) if (rng.next() < 0.3 && budget() > 0) h.attach(seat, c, Math.min(budget(), 1 + rng.nextInt(2)));
    const handSize = seat === 0 ? 3 + rng.nextInt(5) : 2 + rng.nextInt(5);
    h.hand(seat, ...Array.from({ length: handSize }, () => fromPool(ofColor(anyCards), ofColor(newCards)).id));
    h.trash(seat, ...Array.from({ length: rng.nextInt(10) }, () => pickOf(rng, rng.next() < 0.5 ? chars : anyCards).id));
    h.life(seat, ...Array.from({ length: 3 + rng.nextInt(3) }, () => FILLER));
  }
  return { id: label, state: h.state, source: "harness", synthetic: true };
}

export function syntheticPositions(opts: { seed: number; count: number; newShare: number; catalog: Catalog }): Position[] {
  const rng = createSeededRng(opts.seed * 7919 + 13);
  const out: Position[] = [];
  for (let i = 0; i < opts.count; i += 1) {
    try {
      out.push(syntheticPosition(rng, opts.catalog, rng.next() < opts.newShare, `hx${opts.seed}-${i}`));
    } catch {
      // A Leader the Harness cannot start with its filler deck: skip that board.
    }
  }
  return out;
}
