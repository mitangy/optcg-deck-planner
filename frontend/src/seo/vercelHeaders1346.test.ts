import { describe, expect, it } from "vitest";
import { resolveRequest } from "../../../tools/seo/vercel-routes.mjs";
import vercel from "../../../vercel.json";

type Route = { src?: string; dest?: string; status?: number; handle?: string; continue?: boolean; headers?: Record<string, string> };
const routes = vercel.routes as Route[];
const files = new Set(["index.html", "_app.html"]);

describe("planner security headers (#1346)", () => {
  const headerRoute = routes[0];

  it("every path gets the security headers from a first route that lets matching go on (#1346)", () => {
    expect(headerRoute.src).toBe("/(.*)");
    expect(headerRoute.continue).toBe(true);
    expect(headerRoute.headers).toMatchObject({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "SAMEORIGIN",
    });
    expect(headerRoute.headers?.["Permissions-Policy"]).toContain("camera=(self)");
  });

  it("the headers route does not swallow the API proxy or the app routes (#1346)", () => {
    expect(resolveRequest(routes, files, "/api/me")).toMatchObject({ via: "route", src: "/api/(.*)" });
    expect(resolveRequest(routes, files, "/decks")).toMatchObject({ file: "_app.html", status: 200 });
  });
});
