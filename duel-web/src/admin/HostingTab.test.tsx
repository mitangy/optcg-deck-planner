import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AdminHosting } from "./adminApi";
import { HostingTab } from "./HostingTab";

// The exact shape GET /admin/hosting returns (backend/app/admin_hosting.py).
const hosting = {
  vercel: { configured: false },
  render: {
    configured: true,
    services: [{ name: "optcg-api", type: "web_service", suspended: false, url: null, latest: { status: "live", finished_at: "2026-10-23T19:16:54Z", commit: "Fix" } }],
  },
  github: {
    configured: true,
    repo: "mitangy/optcg-deck-planner",
    stars: 7,
    open_issues: 13,
    open_prs: 4,
    ci_runs: [{ name: "CI", conclusion: "success", created_at: "2026-10-23T18:00:00Z", html_url: "https://example.test/1" }],
    bot_runs: [{ name: "Bot self-play", conclusion: "failure", created_at: "2026-10-23T05:00:00Z", html_url: "https://example.test/2" }],
    commits_7d: 42,
    traffic_views: null,
  },
} as unknown as AdminHosting;

describe("HostingTab", () => {
  it("shows the GitHub card from the data the API sends instead of blanking the page (#688)", () => {
    const html = renderToStaticMarkup(<HostingTab data={hosting} />);
    expect(html).toContain("<b>7</b> stars");
    expect(html).toContain("<b>13</b> open issues");
    expect(html).toContain(">CI<");
    expect(html).toContain(">Bot self-play<");
    expect(html).toContain("adm-pill-bad");
  });

  it("links each row's name out in a new tab when the API sent a url, and not when it did not (#691)", () => {
    const withUrls = {
      ...hosting,
      vercel: { configured: true, projects: [{ name: "web", framework: null, deploys_7d: 1, latest: { state: "READY", created_at: "2026-10-23T19:00:00Z", url: "web-abc.vercel.app", commit: null } }, { name: "plain", framework: null, deploys_7d: 0, latest: null }] },
      render: { configured: true, services: [{ name: "optcg-api", type: "web_service", suspended: false, url: "https://optcg-api.onrender.com", latest: null }, { name: "worker", type: "worker", suspended: false, url: null, latest: null }] },
    } as unknown as AdminHosting;
    const html = renderToStaticMarkup(<HostingTab data={withUrls} />);
    const links = [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map((m) => [m[2], m[1]]);
    expect(links).toEqual([
      ["web", "https://web-abc.vercel.app"],
      ["optcg-api", "https://optcg-api.onrender.com"],
      ["CI", "https://example.test/1"],
      ["Bot self-play", "https://example.test/2"],
    ]);
    expect(html.match(/target="_blank" rel="noopener noreferrer"/g)).toHaveLength(4);
    expect(html).toContain("<b>plain</b>");
    expect(html).toContain("<b>worker</b>");
  });
});
