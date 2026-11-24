// Not Express `cors()`: Colyseus already answers OPTIONS and sets Access-Control-* via matchMaker.controller, and double-writing headers breaks matchmake with ERR_HTTP_HEADERS_SENT.
import { matchMaker } from "colyseus";
import { getCorsOriginRegex, getCorsOrigins } from "./env.js";

export function installCorsAllowlist(): void {
  const allowed = new Set(getCorsOrigins());
  const allowedPattern = getCorsOriginRegex();

  matchMaker.controller.getCorsHeaders = (headers) => {
    const origin = (headers.get("origin") ?? "").replace(/\/$/, "");
    if (origin && (allowed.has(origin) || allowedPattern?.test(origin))) {
      return { "Access-Control-Allow-Origin": origin };
    }
    if (!origin) {
      return { "Access-Control-Allow-Origin": "*" };
    }
    return { "Access-Control-Allow-Origin": "null" };
  };
}
