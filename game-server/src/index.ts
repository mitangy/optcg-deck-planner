/**
 * Entrypoint — binds 0.0.0.0:$PORT (default 2567).
 */
import { listen } from "@colyseus/tools";
import app from "./app.config.js";
import { installCorsAllowlist } from "./cors.js";
import { assertProductionAuthConfig, getPort, warnIfDefaultIngestSecretInProduction } from "./env.js";
import { presence } from "./presence.js";
import { startMatchResultOutbox } from "./writeback.js";

assertProductionAuthConfig();
warnIfDefaultIngestSecretInProduction();
installCorsAllowlist();

const port = getPort();
await startMatchResultOutbox();
listen(app, port);
presence.start();
