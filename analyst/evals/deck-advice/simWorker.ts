/** Worker thread for the simulation pool: plays the jobs it is sent and answers with their outcomes, in order. */
import { parentPort } from "node:worker_threads";
import { playJob, type SimJob } from "./sim";

parentPort?.on("message", (msg: { id: number; jobs: SimJob[] }) => {
  parentPort!.postMessage({ id: msg.id, outcomes: msg.jobs.map(playJob) });
});
