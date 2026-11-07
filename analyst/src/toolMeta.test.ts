import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import { createServer } from "./server";
import { adaptValue } from "./sources";
import { catalog } from "./testkit";

describe("tool registry (refactor 3.7a)", () => {
  it("answers the connector with the tool's text only, never the value the app side reads (refactor 3.7a)", async () => {
    const server = createServer(catalog);
    const client = new Client({ name: "test", version: "0" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
    const ok = await client.callTool({ name: "get_cards", arguments: { ids: ["OP01-001"] } });
    expect(Object.keys(ok).sort()).toEqual(["content"]);
    expect(JSON.parse((ok.content as { text: string }[])[0]!.text).cards[0].id).toBe("OP01-001");
    await client.close();
  });

  it("keeps the plain text and logs which tool's citation adapter threw (refactor 3.7c)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const throwing = () => {
        throw new Error("bad shape");
      };
      const out = adaptValue(throwing, "get_cards", { cards: [] });
      expect(out).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(JSON.parse(warn.mock.calls[0]![0] as string)).toEqual({ event: "citation_adapter_error", tool: "get_cards", message: "bad shape" });
    } finally {
      warn.mockRestore();
    }
  });
});
