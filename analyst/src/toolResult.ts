export type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
  /**
   * The value behind a JSON answer (`content` is its JSON text). Citation adapters and the chat's client-action handlers
   * read this, so nothing parses the text back. Never sent over MCP: see `toMcpResult`.
   */
  value?: unknown;
};

export const jsonResult = (value: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(value) }], value });

export const refusalResult = (error: string): ToolResult => ({ isError: true, content: [{ type: "text", text: error }] });

export const failureResult = (err: unknown): ToolResult => refusalResult(err instanceof Error ? err.message : String(err));

/** The MCP result for a tool answer: exactly `content` (and `isError` when set), nothing else, so the connector's output is unchanged. */
export const toMcpResult = (r: ToolResult) => ({ content: r.content, ...(r.isError ? { isError: true } : {}) });
