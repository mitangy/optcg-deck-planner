/** What a tool hands back: the text the model reads, and for a JSON answer the value it was made from. */
export type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
  /**
   * The value behind a JSON answer (`content` is its JSON text). Citation adapters and the chat's client-action handlers
   * read this, so nothing parses the text back. Never sent over MCP: see `toMcpResult`.
   */
  value?: unknown;
};

/** A JSON answer: `content` is the text the model reads, `value` the same data for the app side. */
export const jsonResult = (value: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(value) }], value });

/** A plain-text refusal the model can read and fix. */
export const refusalResult = (error: string): ToolResult => ({ isError: true, content: [{ type: "text", text: error }] });

/** A thrown error as a tool answer. */
export const failureResult = (err: unknown): ToolResult => refusalResult(err instanceof Error ? err.message : String(err));

/** The MCP result for a tool answer: exactly `content` (and `isError` when set), nothing else, so the connector's output is unchanged. */
export const toMcpResult = (r: ToolResult) => ({ content: r.content, ...(r.isError ? { isError: true } : {}) });
