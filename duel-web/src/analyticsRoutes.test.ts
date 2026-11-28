import { createAnalyticsBeforeSend } from "@optcg/ui/appShell";
import { describe, expect, it } from "vitest";
import { ANALYTICS_TOKEN_ROUTES } from "./analyticsRoutes";
import { routeMetaFor } from "./seo/routeMetaTable";

describe("join links in analytics and page meta (#1507)", () => {
  it("analytics never sees the room id of a join or watch link (#1507)", () => {
    const beforeSend = createAnalyticsBeforeSend(ANALYTICS_TOKEN_ROUTES);
    expect(beforeSend({ url: "https://optcgduel.app/join/K7QX2M" }).url).toBe("https://optcgduel.app/join/[token]");
    expect(beforeSend({ url: "https://optcgduel.app/watch/K7QX2M" }).url).toBe("https://optcgduel.app/watch/[token]");
  });

  it("a join link has its own tab title and is kept out of search (#1507)", () => {
    const meta = routeMetaFor("/join/K7QX2M");
    expect(meta.title).toMatch(/^Join a match/);
    expect(meta.noindex).toBe(true);
  });
});
