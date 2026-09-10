/**
 * Entrypoint — binds 0.0.0.0:$PORT (default 2567).
 */
import { listen } from "@colyseus/tools";
import app from "./app.config.js";
import { getPort } from "./env.js";

const port = getPort();
listen(app, port);
