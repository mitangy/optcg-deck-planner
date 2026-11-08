import { describe, expect, it } from "vitest";
import { compactAgo, historyAgo, staffAgo } from "./relativeTime";

const now = Date.parse("2026-11-05T12:00:00Z");

describe("staffAgo (moved from adminLogic, refactor 3.4b)", () => {
  it("writes how long ago in minutes, hours and days, and the date after a month (#988)", () => {
    expect(staffAgo("2026-11-05T11:59:40Z", now)).toBe("just now");
    expect(staffAgo("2026-11-05T11:55:00Z", now)).toBe("5 min ago");
    expect(staffAgo("2026-11-05T09:00:00Z", now)).toBe("3 h ago");
    expect(staffAgo("2026-11-04T11:00:00Z", now)).toBe("1 day ago");
    expect(staffAgo("2026-11-02T11:00:00Z", now)).toBe("3 days ago");
    expect(staffAgo("2026-09-01T11:00:00Z", now)).toBe("2026-09-01");
  });

  it("rounds down, so 59 minutes is not an hour and 30 days is not a date (refactor 3.4b)", () => {
    expect(staffAgo("2026-11-05T11:00:20Z", now)).toBe("59 min ago");
    expect(staffAgo("2026-10-06T12:00:00Z", now)).toBe("30 days ago");
    expect(staffAgo("2026-10-05T12:00:00Z", now)).toBe("2026-10-05");
  });
});

describe("compactAgo (the admin hosting rows, refactor 3.4b)", () => {
  it("shows a dash with no time and short m / h / d units otherwise", () => {
    expect(compactAgo(null, now)).toBe("—");
    expect(compactAgo(undefined, now)).toBe("—");
    expect(compactAgo("2026-11-05T11:15:00Z", now)).toBe("45m ago");
    expect(compactAgo("2026-11-05T09:00:00Z", now)).toBe("3h ago");
  });

  it("stays in hours until two days, then counts days", () => {
    expect(compactAgo("2026-11-03T13:00:00Z", now)).toBe("47h ago");
    expect(compactAgo("2026-11-03T12:00:00Z", now)).toBe("2d ago");
    expect(compactAgo("2026-10-26T12:00:00Z", now)).toBe("10d ago");
  });

  it("never reads a future time as negative", () => {
    expect(compactAgo("2026-11-05T12:30:00Z", now)).toBe("0m ago");
  });
});

describe("historyAgo (the match history rows, refactor 3.4b)", () => {
  const at = new Date(now);
  it("says just now under a minute, then m / h / d", () => {
    expect(historyAgo(new Date("2026-11-05T11:59:45Z"), at)).toBe("just now");
    expect(historyAgo(new Date("2026-11-05T11:15:00Z"), at)).toBe("45m ago");
    expect(historyAgo(new Date("2026-11-05T09:00:00Z"), at)).toBe("3h ago");
    expect(historyAgo(new Date("2026-11-02T12:00:00Z"), at)).toBe("3d ago");
  });

  it("gives the month and day from a week on", () => {
    expect(historyAgo(new Date("2026-10-30T12:00:00Z"), at)).toBe("6d ago");
    expect(historyAgo(new Date("2026-10-29T12:00:00Z"), at)).toBe(new Date("2026-10-29T12:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric" }));
  });
});
