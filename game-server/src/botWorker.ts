/**
 * Worker-thread side of the Hard bot (#635): runs one search per request so the room's event loop is never blocked.
 * Receives { id, state, seat, seed, memory, budgetMs, samples } and answers { id, intent, searched, ms } (or { id, error }).
 */
import { parentPort } from "node:worker_threads";
import { chooseBotIntentFromState, createSeededRng, seedBotTurnMemory, type BotTurnMemory, type Intent, type MatchState, type Seat } from "@optcg/rules";

export interface BotJob {
  id: number;
  state: MatchState;
  seat: Seat;
  /** Seed of the rng this decision uses (the room draws it from its bot rng, so a game stays reproducible). */
  seed: number;
  memory: BotTurnMemory;
  budgetMs: number;
  samples?: number;
}

export type BotJobResult = { id: number; intent: Intent | null; searched: boolean; ms: number } | { id: number; error: string };

parentPort?.on("message", (job: BotJob) => {
  const started = performance.now();
  try {
    const rng = createSeededRng(job.seed);
    seedBotTurnMemory(job.state, job.seat, rng, job.memory);
    let searched = false;
    const intent = chooseBotIntentFromState(job.state, job.seat, {
      level: "hard", rng, budgetMs: job.budgetMs, ...(job.samples !== undefined ? { samples: job.samples } : {}), onTrace: () => { searched = true; },
    });
    parentPort!.postMessage({ id: job.id, intent, searched, ms: performance.now() - started } satisfies BotJobResult);
  } catch (e) {
    parentPort!.postMessage({ id: job.id, error: e instanceof Error ? e.message : String(e) } satisfies BotJobResult);
  }
});
