/**
 * Bot simulation for the deck-advice eval (#678): how a deck does against the meta field, played by the duel
 * engine's bots. Compute only, no API calls.
 *
 * Paired by design: game `g` against opponent `o` uses the same seed, seat and first player for every version of
 * a deck, so the original and the edited deck face the same opponent in the same slot (the engine shuffles
 * from the seed, so the two decks' shuffles are as alike as different card lists allow). Every game is a pure
 * function of its job, so any number of workers, in any order, give the same totals.
 */
import type { BotLevel, Seat } from "@optcg/rules";
import { playBotGame } from "@optcg/rules/src/sim/selfPlay";
import { diffOfProportions, wilson } from "../qa/stats";

export type SimDeck = { leaderId: string; deck: string[] };
export type Outcome = "win" | "loss" | "unfinished";

export type SimJob = {
  seed: number;
  mine: SimDeck;
  opp: SimDeck;
  mySeat: Seat;
  firstSeat: Seat;
  levels: [BotLevel, BotLevel];
  opponent: number;
};

export function playJob(job: SimJob): Outcome {
  const players = job.mySeat === 0 ? [job.mine, job.opp] : [job.opp, job.mine];
  const levels = job.mySeat === 0 ? job.levels : ([job.levels[1], job.levels[0]] as [BotLevel, BotLevel]);
  const r = playBotGame({
    seed: job.seed,
    players: [{ leaderId: players[0]!.leaderId, deck: players[0]!.deck }, { leaderId: players[1]!.leaderId, deck: players[1]!.deck }],
    levels,
    firstSeat: job.firstSeat,
  });
  if (r.winner === null) return "unfinished";
  return r.winner === job.mySeat ? "win" : "loss";
}

export type SimOptions = {
  games: number;
  seed: number;
  levels?: [BotLevel, BotLevel];
};

export function simJobs(mine: SimDeck, field: readonly SimDeck[], opts: SimOptions): SimJob[] {
  const jobs: SimJob[] = [];
  field.forEach((opp, o) => {
    for (let g = 0; g < opts.games; g++) {
      jobs.push({
        seed: opts.seed + o * 100_003 + g,
        mine,
        opp,
        mySeat: (g % 2) as Seat,
        firstSeat: (Math.floor(g / 2) % 2) as Seat,
        levels: opts.levels ?? ["normal", "normal"],
        opponent: o,
      });
    }
  });
  return jobs;
}

export type SimRun = (jobs: SimJob[]) => Promise<Outcome[]>;
export const inProcess: SimRun = async (jobs) => jobs.map(playJob);

export type SimResult = {
  games: number;
  wins: number;
  losses: number;
  unfinished: number;
  winRate: number | null;
  interval: [number, number];
};

export function tally(outcomes: readonly Outcome[]): SimResult {
  const wins = outcomes.filter((o) => o === "win").length;
  const losses = outcomes.filter((o) => o === "loss").length;
  const finished = wins + losses;
  return { games: outcomes.length, wins, losses, unfinished: outcomes.length - finished, winRate: finished ? wins / finished : null, interval: wilson(wins, finished) };
}

export async function simulate(mine: SimDeck, field: readonly SimDeck[], opts: SimOptions, run: SimRun = inProcess): Promise<SimResult> {
  return tally(await run(simJobs(mine, field, opts)));
}

export type WinRateChange = { diff: number; lo: number; hi: number; before: SimResult; after: SimResult };

export function compareSims(before: SimResult, after: SimResult): WinRateChange {
  return { ...diffOfProportions({ k: before.wins, n: before.wins + before.losses }, { k: after.wins, n: after.wins + after.losses }), before, after };
}

export const lostSignificantly = (c: Pick<WinRateChange, "hi">): boolean => c.hi < 0;
