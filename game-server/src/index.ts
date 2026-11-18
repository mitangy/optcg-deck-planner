import { listen } from "@colyseus/tools";
import app from "./app.config.js";
import { installCorsAllowlist } from "./cors.js";
import { assertProductionAuthConfig, assertProductionIngestSecret, getPort } from "./env.js";
import { presence } from "./presence.js";
import { startMatchResultOutbox } from "./writeback.js";

assertProductionAuthConfig();
assertProductionIngestSecret();
installCorsAllowlist();

const port = getPort();
await startMatchResultOutbox();
listen(app, port);
presence.start();
