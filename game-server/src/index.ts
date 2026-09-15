/**
 * Entrypoint — binds 0.0.0.0:$PORT (default 2567).
 */
import { listen } from "@colyseus/tools";
import app from "./app.config.js";
import { installCorsAllowlist } from "./cors.js";
import { getPort } from "./env.js";
import { startMatchResultOutbox } from "./writeback.js";

installCorsAllowlist();

const port = getPort();
await startMatchResultOutbox();
listen(app, port);
