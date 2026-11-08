import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AdminTraffic } from "./adminApi";
import { TrafficTab } from "./TrafficTab";

const dates = ["2026-11-04", "2026-11-05", "2026-11-06"];
const project = {
  name: "optcg-duel-web",
  totals: { visitors: 20, pageviews: 90 },
  daily: dates.map((date, i) => ({ date, visitors: i, pageviews: i * 2 })),
  pages: [{ key: "/", visitors: 12, pageviews: 40 }],
  referrers: [{ key: "", visitors: 66, pageviews: 321 }, { key: "google.com", visitors: 23, pageviews: 31 }],
  countries: [{ key: "US", visitors: 8, pageviews: 9 }],
  devices: [{ key: "mobile", visitors: 5, pageviews: 6 }],
};
const service = {
  name: "optcg-api",
  type: "web_service",
  requests_daily: dates.map((date) => ({ date, total: 10, errors_5xx: 1 })),
  requests: 1234,
  errors_5xx: 7,
  errors_4xx: 56,
  cpu_avg: 0.006,
  cpu_peak: 0.25,
  cpu_limit: 0.5,
  memory_avg: 207 * 1024 * 1024,
  memory_peak: 256 * 1024 * 1024,
  memory_limit: 512 * 1024 * 1024,
};
const full = {
  days: 30,
  vercel: { configured: true, projects: [project] },
  render: { configured: true, days: 30, services: [service] },
} as unknown as AdminTraffic;

const html = (data: AdminTraffic, days: 7 | 14 | 30 | 90 = 30) => renderToStaticMarkup(<TrafficTab data={data} days={days} onDaysChange={() => {}} />);

describe("TrafficTab", () => {
  it("shows each project's totals and top lists and each service's load from what the API sends (#1020)", () => {
    const out = html(full);
    expect(out).toContain("optcg-duel-web");
    expect(out).toMatch(/Visitors<\/span><span class="adm-tile-value">20</);
    expect(out).toMatch(/Page views<\/span><span class="adm-tile-value">90</);
    expect(out).toContain('aria-label="Referrers"');
    expect(out).toContain(">google.com<");
    expect(out).toContain("United States");
    expect(out).toContain(">Mobile<");
    expect(out).toMatch(/Requests<\/span><span class="adm-tile-value">1,234</);
    expect(out).toMatch(/Server errors<\/span><span class="adm-tile-value">7</);
    expect(out).toContain("peak 0.25 cores · 50% of 0.5 cores");
    expect(out).toContain("peak 256 MB · 50% of 512 MB");
  });

  it("calls a visit with no referrer Direct (#1020)", () => {
    const out = html(full);
    expect(out).toContain(">Direct<");
    expect(out).not.toContain("title=\"\"");
  });

  it("says a provider is not connected, and shows a failed project or service on its own row without hiding the others (#1020)", () => {
    const off = html({ days: 30, vercel: { configured: false }, render: { configured: false } } as AdminTraffic);
    expect(off.match(/Not connected/g)).toHaveLength(2);
    const part = html({
      days: 30,
      vercel: { configured: true, projects: [{ name: "broken-site", error: "HTTP 403" }, project] },
      render: { configured: true, days: 30, services: [{ name: "flaky", error: "HTTP 500" }, service] },
    } as unknown as AdminTraffic);
    expect(part).toContain("Could not load broken-site: HTTP 403");
    expect(part).toContain("Could not load flaky: HTTP 500");
    expect(part).toContain("optcg-duel-web");
    expect(part).toContain("optcg-api");
    const whole = html({ days: 30, vercel: { configured: true, error: "HTTP 401" }, render: { configured: false } } as AdminTraffic);
    expect(whole).toContain("Could not load: HTTP 401");
  });

  it("notes that Render keeps 30 days only when a longer range was asked for (#1020)", () => {
    const ninety = html({ ...full, days: 90 }, 90);
    expect(ninety).toContain("Showing the last 30 days: Render keeps 30.");
    expect(html(full, 30)).not.toContain("Render keeps");
  });
});
