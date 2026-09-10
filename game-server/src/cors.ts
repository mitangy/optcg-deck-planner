/**
 * Colyseus-compatible CORS allowlist (Step 4.5).
 *
 * Do NOT use Express `cors()` middleware — Colyseus already answers OPTIONS and
 * sets Access-Control-* via matchMaker.controller; double-writing headers breaks
 * matchmake with ERR_HTTP_HEADERS_SENT.
 */
import { matchMaker } from "colyseus";
import { getCorsOrigins } from "./env.js";

export function installCorsAllowlist(): void {
  const allowed = new Set(getCorsOrigins());

  matchMaker.controller.getCorsHeaders = (headers) => {
    const origin = (headers.get("origin") ?? "").replace(/\/$/, "");
    if (origin && allowed.has(origin)) {
      return { "Access-Control-Allow-Origin": origin };
    }
    // Non-browser / same-origin tooling (no Origin header): keep permissive local default.
    if (!origin) {
      return { "Access-Control-Allow-Origin": "*" };
    }
    // Reject unknown browser origins by omitting a usable ACAO (browser will block).
    return { "Access-Control-Allow-Origin": "null" };
  };
}
