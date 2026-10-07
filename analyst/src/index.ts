/**
 * HTTP entry for the Log Pose connector: MCP over Streamable HTTP (stateless), plus /health.
 * Add `<public URL>/mcp/<ANALYST_CONNECTOR_KEY>` in Claude under Settings > Connectors, or a
 * personal `<public URL>/mcp/u/<token>` link made in the duel app's Settings.
 */
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import type { NextFunction, Request, Response } from "express";
import { keyMatches } from "./auth";
import { loadCatalog } from "./catalog";
import { tokenIsValid, type PlannerApi } from "./matches";
import { OfficialLibrary } from "./official/library";
import { loadPlaybook } from "./playbook";
import { createServer, type Knowledge, type PersonalContext } from "./server";
import { admit, admitToken, anthropicModel, originAllowed, briefBody, chatBody, ChatHttpError, reviewBody, runBrief, runChat, runReview, type ChatDeps, type SseEvent } from "./chat";

const catalog = loadCatalog();
const connectorKey = process.env.ANALYST_CONNECTOR_KEY ?? "";
const port = Number(process.env.PORT ?? 8787);
const plannerApi: PlannerApi = {
  baseUrl: process.env.PLANNER_API_URL ?? "https://optcg-deck-planner.app/api",
  serviceSecret: process.env.ANALYST_SERVICE_SECRET ?? "",
};

const knowledge: Knowledge = {
  library: new OfficialLibrary({ baseUrl: process.env.OFFICIAL_SITE_URL || undefined }),
  playbook: loadPlaybook(),
  stats: plannerApi.serviceSecret ? plannerApi : undefined,
};
knowledge.library!.warm();

const app = createMcpExpressApp({ host: "0.0.0.0" });

app.get("/health", (_req, res) => {
  res.json({ ok: true, cards: catalog.cards.size, playbookNotes: knowledge.playbook!.notes.size });
});

/** Personal links checked recently, so each MCP request doesn't wait on the planner API. */
const validTokens = new Map<string, number>();
const TOKEN_CHECK_MS = 5 * 60_000;

async function personalContext(token: string): Promise<PersonalContext | null> {
  const checked = validTokens.get(token);
  if (checked === undefined || Date.now() - checked > TOKEN_CHECK_MS) {
    if (!(await tokenIsValid(plannerApi, token))) {
      validTokens.delete(token);
      return null;
    }
    validTokens.set(token, Date.now());
  }
  return { api: plannerApi, token };
}

async function handleMcp(req: Request, res: Response) {
  let personal: PersonalContext | undefined;
  if (req.params.token !== undefined) {
    const ctx = await personalContext(req.params.token as string).catch(() => undefined);
    if (ctx === undefined) {
      res.status(503).json({ error: "Could not check this link with the deck planner. Try again shortly." });
      return;
    }
    if (ctx === null) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    personal = ctx;
  } else if (!keyMatches(req.params.key as string | undefined, connectorKey)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const server = createServer(catalog, undefined, personal, knowledge);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error(JSON.stringify({ event: "mcp_error", message: err instanceof Error ? err.message : String(err) }));
    if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
  }
}

const notAllowed = (_req: Request, res: Response) => {
  res.status(405).set("Allow", "POST").json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
};

// Personal links (/mcp/u/<token>) come from the duel app's Settings and add the player's own games and decks.
for (const path of [connectorKey ? "/mcp/:key" : "/mcp", "/mcp/u/:token"]) {
  app.post(path, handleMcp);
  app.get(path, notAllowed);
  app.delete(path, notAllowed);
}

// In-app chat panel and post-game analysis (duel app and deck planner), streamed as server-sent events.
const anthropicKey = process.env.ANTHROPIC_API_KEY ?? "";
const chatDeps: ChatDeps | null =
  anthropicKey && plannerApi.serviceSecret
    ? { api: plannerApi, catalog, knowledge, callModel: anthropicModel(new Anthropic({ apiKey: anthropicKey }) as never) }
    : null;
const chatOrigins = (process.env.ANALYST_CHAT_ORIGINS ?? "https://optcgduel.app,https://optcg-deck-planner.app")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function chatCors(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  if (originAllowed(chatOrigins, origin)) {
    res.set("Access-Control-Allow-Origin", origin!);
    res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Max-Age", "600");
  }
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}

type Run<T> = (deps: ChatDeps, token: string, body: T, emit: (e: SseEvent) => void, signal: AbortSignal) => Promise<void>;

function sse<T>(kind: "chat" | "review" | "brief", schema: z.ZodType<T>, run: Run<T>, admitWith: typeof admit = admit) {
  return async (req: Request, res: Response) => {
    if (!chatDeps) {
      res.status(503).json({ error: "Log Pose chat isn't set up on this server.", code: "server" });
      return;
    }
    const body = schema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "That request didn't look right.", code: "bad_request" });
      return;
    }
    const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1] ?? null;
    const abort = new AbortController();
    res.on("close", () => abort.abort());
    let streaming = false;
    try {
      const token = await admitWith(plannerApi, bearer);
      res.status(200).set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" });
      res.flushHeaders();
      streaming = true;
      const emit = (e: SseEvent) => {
        if (!res.writableEnded) res.write(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`);
      };
      await run(chatDeps, token, body.data, emit, abort.signal);
    } catch (err) {
      const httpErr = err instanceof ChatHttpError ? err : null;
      if (!httpErr) console.error(JSON.stringify({ event: `${kind}_error`, message: err instanceof Error ? err.message : String(err) }));
      const message = httpErr?.message ?? (err instanceof Error && err.message.startsWith("Log Pose") ? err.message : "Log Pose hit a problem. Try again.");
      if (!streaming) res.status(httpErr?.status ?? 500).json({ error: message, code: httpErr?.code ?? "server" });
      else if (!res.writableEnded) res.write(`event: error\ndata: ${JSON.stringify({ message, code: httpErr?.code ?? "server" })}\n\n`);
    } finally {
      if (streaming && !res.writableEnded) res.end();
    }
  };
}

app.use(["/chat", "/review-match", "/brief"], chatCors);
app.post("/chat", sse("chat", chatBody, runChat));
app.post("/review-match", sse("review", reviewBody, runReview));
// A brief checks the token first and the budget only when it has to write one: a saved brief is free.
app.post("/brief", sse("brief", briefBody, runBrief, admitToken));

app.listen(port, () => {
  console.log(JSON.stringify({ event: "listening", port, cards: catalog.cards.size, keyed: Boolean(connectorKey), chat: Boolean(chatDeps) }));
});
