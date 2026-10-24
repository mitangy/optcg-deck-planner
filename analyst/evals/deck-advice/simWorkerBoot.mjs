// Entry for the simulation worker threads (#678): a worker does not inherit tsx's TypeScript loader, so load it first.
import { register } from "tsx/esm/api";

register();
await import("./simWorker.ts");
