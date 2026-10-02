/**
 * HTTP entry for the Log Pose connector: MCP over Streamable HTTP (stateless), plus /health.
 * Add `<public URL>/mcp/<ANALYST_CONNECTOR_KEY>` in Claude under Settings > Connectors.
 */
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Request, Response } from "express";
import { keyMatches } from "./auth";
import { loadCatalog } from "./catalog";
import { createServer } from "./server";

const catalog = loadCatalog();
const connectorKey = process.env.ANALYST_CONNECTOR_KEY ?? "";
const port = Number(process.env.PORT ?? 8787);

const app = createMcpExpressApp({ host: "0.0.0.0" });

app.get("/health", (_req, res) => {
  res.json({ ok: true, cards: catalog.cards.size });
});

async function handleMcp(req: Request, res: Response) {
  if (!keyMatches(req.params.key as string | undefined, connectorKey)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const server = createServer(catalog);
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

for (const path of connectorKey ? ["/mcp/:key"] : ["/mcp"]) {
  app.post(path, handleMcp);
  app.get(path, notAllowed);
  app.delete(path, notAllowed);
}

app.listen(port, () => {
  console.log(JSON.stringify({ event: "listening", port, cards: catalog.cards.size, keyed: Boolean(connectorKey) }));
});
