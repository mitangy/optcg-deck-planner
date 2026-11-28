import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AdminClientErrors } from "./adminApi";
import { ErrorsTab } from "./ErrorsTab";

const group = (over: Partial<AdminClientErrors["groups"][number]> = {}) => ({
  fingerprint: "f1",
  app: "duel" as const,
  message: "TypeError: x is undefined",
  stack: "at render (app.js:1:1)",
  url: "/duel",
  release: "abc1234",
  count: 12,
  users: 3,
  first_seen: "2026-11-01T10:00:00Z",
  last_seen: "2026-11-02T10:00:00Z",
  ...over,
});

const render = (data: AdminClientErrors) => renderToStaticMarkup(<ErrorsTab data={data} days={7} onDaysChange={() => undefined} />);

describe("Errors tab (#1500)", () => {
  it("lists each group with its app, how often it happened and which build and page (#1500)", () => {
    const html = render({ days: 7, total: 14, groups: [group(), group({ fingerprint: "f2", app: "api", message: "RuntimeError: db down", count: 2, users: 0, url: "/decks" })] });
    expect(html).toContain("TypeError: x is undefined");
    expect(html).toContain("×12");
    expect(html).toContain(">duel<");
    expect(html).toContain("build abc1234");
    expect(html).toContain("3 signed-in players");
    expect(html).toContain("RuntimeError: db down");
    expect(html).toContain("adm-pill-bad");
    expect(html).toContain("14 errors in 2 groups");
  });

  it("says so when nothing was reported in the range (#1500)", () => {
    expect(render({ days: 7, total: 0, groups: [] })).toContain("No errors reported in this range.");
  });
});
