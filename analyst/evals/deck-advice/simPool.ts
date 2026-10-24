/**
 * A small pool of worker threads for the simulation (#678). Games are CPU bound and synchronous, so threads are
 * what let a run use more than one core while the main thread keeps the model calls going. Jobs are handed out in
 * chunks and the outcomes come back in job order, so the result does not depend on the thread count.
 */
import { Worker } from "node:worker_threads";
import type { Outcome, SimJob, SimRun } from "./sim";

const CHUNK = 8;

export function simPool(threads: number): { run: SimRun; close: () => Promise<void> } {
  const workers = Array.from({ length: Math.max(1, threads) }, () => new Worker(new URL("./simWorkerBoot.mjs", import.meta.url)));
  const free = [...workers];
  const waiting: ((w: Worker) => void)[] = [];
  const take = () => new Promise<Worker>((resolve) => (free.length ? resolve(free.pop()!) : waiting.push(resolve)));
  const give = (w: Worker) => (waiting.length ? waiting.shift()!(w) : free.push(w));
  let id = 0;

  const play = async (jobs: SimJob[]): Promise<Outcome[]> => {
    const w = await take();
    const mine = id++;
    try {
      return await new Promise<Outcome[]>((resolve, reject) => {
        const onMessage = (m: { id: number; outcomes: Outcome[] }) => {
          if (m.id !== mine) return;
          cleanup();
          resolve(m.outcomes);
        };
        const onError = (e: Error) => {
          cleanup();
          reject(e);
        };
        const cleanup = () => {
          w.off("message", onMessage);
          w.off("error", onError);
        };
        w.on("message", onMessage);
        w.on("error", onError);
        w.postMessage({ id: mine, jobs });
      });
    } finally {
      give(w);
    }
  };

  const run: SimRun = async (jobs) => {
    const chunks: SimJob[][] = [];
    for (let i = 0; i < jobs.length; i += CHUNK) chunks.push(jobs.slice(i, i + CHUNK));
    return (await Promise.all(chunks.map(play))).flat();
  };
  return { run, close: async () => void (await Promise.all(workers.map((w) => w.terminate()))) };
}
