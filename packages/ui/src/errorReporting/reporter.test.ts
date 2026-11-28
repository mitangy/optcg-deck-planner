import { describe, expect, it, vi } from "vitest";
import { createErrorReporter, MAX_REPORTS_PER_PAGE, type ErrorReport } from "./reporter";

function setup(over: Partial<Parameters<typeof createErrorReporter>[0]> = {}) {
  const sent: ErrorReport[] = [];
  const reporter = createErrorReporter({ app: "duel", release: "abc1234", send: (r) => sent.push(r), pagePath: () => "/duel", ...over });
  return { sent, reporter };
}

function err(message: string, frame = "at render (app.js:1:1)") {
  const e = new Error(message);
  e.stack = `Error: ${message}\n    ${frame}`;
  return e;
}

describe("error reporter", () => {
  it("sends the same error once per page load, however often it repeats (#1500)", () => {
    const { sent, reporter } = setup();
    expect(reporter.report(err("boom"))).toBe(true);
    expect(reporter.report(err("boom"))).toBe(false);
    expect(reporter.report(err("boom"))).toBe(false);
    expect(sent).toHaveLength(1);
  });

  it("treats the same message from another place in the code as another error (#1500)", () => {
    const { sent, reporter } = setup();
    reporter.report(err("boom", "at a (app.js:1:1)"));
    reporter.report(err("boom", "at b (app.js:9:9)"));
    expect(sent).toHaveLength(2);
  });

  it("stops after the per-page cap so a render loop cannot become a request loop (#1500)", () => {
    const { sent, reporter } = setup();
    for (let i = 0; i < MAX_REPORTS_PER_PAGE + 5; i++) reporter.report(err(`distinct ${i}`));
    expect(sent).toHaveLength(MAX_REPORTS_PER_PAGE);
  });

  it("does not spend the cap on repeats (#1500)", () => {
    const { sent, reporter } = setup({ maxPerPage: 2 });
    reporter.report(err("a"));
    for (let i = 0; i < 20; i++) reporter.report(err("a"));
    reporter.report(err("b"));
    expect(sent.map((r) => r.message)).toEqual(["Error: a", "Error: b"]);
  });

  it("sends nothing when reporting is disabled, as in an automated browser (#1500)", () => {
    const { sent, reporter } = setup({ enabled: false });
    expect(reporter.report(err("boom"))).toBe(false);
    expect(sent).toEqual([]);
  });

  it("carries the app, release, page path and the component stack of a render error (#1500)", () => {
    const { sent, reporter } = setup();
    reporter.report(err("boom"), "Component stack:\n    at Board");
    expect(sent[0]).toMatchObject({ app: "duel", release: "abc1234", url: "/duel", message: "Error: boom" });
    expect(sent[0]!.stack).toContain("Component stack:\n    at Board");
  });

  it("reports a rejection that is not an Error by its value (#1500)", () => {
    const send = vi.fn();
    const reporter = createErrorReporter({ app: "planner", release: "dev", send });
    reporter.report("plain string reason");
    reporter.report({ code: 7 });
    expect(send.mock.calls.map((c) => (c[0] as ErrorReport).message)).toEqual(["plain string reason", '{"code":7}']);
  });
});
