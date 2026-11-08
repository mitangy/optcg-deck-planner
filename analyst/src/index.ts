/**
 * Process entry for the Log Pose service: reads the environment, loads the card catalog and the knowledge
 * sources, and listens. The routes live in app.ts.
 */
import Anthropic from "@anthropic-ai/sdk";
import { anthropicModel } from "./anthropic";
import { createApp } from "./app";
import { loadCatalog } from "./catalog";
import { ANTHROPIC_MAX_RETRIES, ANTHROPIC_TIMEOUT_MS, loadConfig } from "./config";
import type { PlannerApi } from "./matches";
import { OfficialLibrary } from "./official/library";
import { loadPlaybook } from "./playbook";
import type { Knowledge } from "./server";
import type { ChatDeps } from "./types";

const config = loadConfig();
const catalog = loadCatalog();
const plannerApi: PlannerApi = { baseUrl: config.plannerApiUrl, serviceSecret: config.serviceSecret };

const knowledge: Knowledge = {
  library: new OfficialLibrary({ baseUrl: config.officialSiteUrl }),
  playbook: loadPlaybook(),
  stats: plannerApi.serviceSecret ? plannerApi : undefined,
};
knowledge.library!.warm();

const chat: ChatDeps | null =
  config.anthropicKey && plannerApi.serviceSecret
    ? {
        api: plannerApi,
        catalog,
        knowledge,
        callModel: anthropicModel(new Anthropic({ apiKey: config.anthropicKey, timeout: ANTHROPIC_TIMEOUT_MS, maxRetries: ANTHROPIC_MAX_RETRIES })),
      }
    : null;

const app = createApp(config, { catalog, knowledge, api: plannerApi, chat });

app.listen(config.port, () => {
  console.log(JSON.stringify({ event: "listening", port: config.port, cards: catalog.cards.size, keyed: Boolean(config.connectorKey), chat: Boolean(chat) }));
});
