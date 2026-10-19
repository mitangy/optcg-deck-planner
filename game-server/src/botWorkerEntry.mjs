// Entry of the Hard bot's worker threads (#635). The server runs TypeScript through tsx, whose loader does not reach a worker
// thread by itself, so the worker registers it and then loads the real worker module.
import { register } from "tsx/esm/api";

register();
await import("./botWorker.ts");
