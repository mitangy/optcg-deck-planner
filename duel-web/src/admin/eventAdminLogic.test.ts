import { beforeAll, describe, expect, it } from "vitest";
import {
  canDeleteEvent,
  defaultEventId,
  eventEditBody,
  eventFormPayload,
  eventLocks,
  fromLocalInput,
  newEventForm,
  toLocalInput,
  type EventForm,
} from "./adminLogic";
import type { EventFields } from "./adminApi";

beforeAll(() => {
  // The datetime-local fields are read in the admin's zone; pin one so the offsets below are exact.
  process.env.TZ = "America/New_York";
});

const form = (over: Partial<EventForm> = {}): EventForm => ({ ...newEventForm(new Date(2026, 10, 6, 9, 0)), title: "Friday Bracket", ...over });

describe("admin events: local times (#1019)", () => {
  it("reads and writes datetime-local fields in the admin's own time zone (#1019)", () => {
    expect(toLocalInput("2026-11-22T17:00:00.000Z")).toBe("2026-11-22T12:00");
    expect(toLocalInput("2026-07-04T01:05:00.000Z")).toBe("2026-07-03T21:05");
    expect(fromLocalInput("2026-11-22T12:00")).toBe("2026-11-22T17:00:00.000Z");
    expect(fromLocalInput("2026-07-03T21:05")).toBe("2026-07-04T01:05:00.000Z");
    expect(fromLocalInput("")).toBeNull();
    expect(fromLocalInput("not a date")).toBeNull();
  });
});

describe("admin events: the form (#1019)", () => {
  it("turns a new event's defaults into a valid request that starts a week out (#1019)", () => {
    const out = eventFormPayload(form());
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.fields.starts_at).toBe("2026-11-13T17:00:00.000Z");
    expect(Date.parse(out.fields.ends_at) - Date.parse(out.fields.starts_at)).toBe(3 * 3_600_000);
    expect(out.fields).toMatchObject({ format: "casual", bracket_size: null, prize_method: "draw", winners: 3, min_games: 3, min_opponents: 2, min_turns: 3 });
  });

  it.each([
    ["a blank title", { title: "   " }],
    ["a title over 80 characters", { title: "x".repeat(81) }],
    ["no start", { startsAt: "" }],
    ["an end equal to the start", { endsAt: "2026-11-13T12:00" }],
    ["an end before the start", { endsAt: "2026-11-13T11:00" }],
    ["a prize summary over 200 characters", { prize: "x".repeat(201) }],
    ["no winners", { winners: "0" }],
    ["more than 50 winners", { winners: "51" }],
    ["a half-typed minimum", { minTurns: "" }],
    ["a negative minimum", { minGames: "-1" }],
    ["a fractional minimum", { minOpponents: "1.5" }],
  ])("refuses %s before it reaches the server (#1019)", (_name, over) => {
    const out = eventFormPayload(form(over));
    expect(out.ok).toBe(false);
  });

  it("sends a bracket size only for single elimination, and trims the text (#1019)", () => {
    const bracket = eventFormPayload(form({ format: "single_elim", bracketSize: 16, bestOf: 3, title: "  Cup  ", prize: " Box " }));
    expect(bracket.ok && bracket.fields).toMatchObject({ bracket_size: 16, best_of: 3, title: "Cup", prize: "Box" });
    const swiss = eventFormPayload(form({ format: "swiss", bracketSize: 16 }));
    expect(swiss.ok && swiss.fields.bracket_size).toBeNull();
  });
});

describe("admin events: what is locked (#1019)", () => {
  const draw = (over: object = {}) => ({ seed_hash: "h", committed_at: null, drawn_at: null, seed: null, forfeited: [], ranking: [], winners: [], ...over });

  it("locks nothing before a seed exists (#1019)", () => {
    expect(eventLocks({ status: "upcoming", draw: null }).fields.size).toBe(0);
  });

  it("locks the prize method once a seed is committed, and the start once it has begun (#1019)", () => {
    expect([...eventLocks({ status: "upcoming", draw: draw() }).fields]).toEqual(["prize_method"]);
    expect([...eventLocks({ status: "live", draw: draw() }).fields].sort()).toEqual(["prize_method", "starts_at"]);
  });

  it("locks the dates, winners, minimums and method after the draw, but not the wording (#1019)", () => {
    const { fields, reason } = eventLocks({ status: "drawn", draw: draw({ drawn_at: "2026-11-23T00:00:00Z" }) });
    expect([...fields].sort()).toEqual(["ends_at", "min_games", "min_opponents", "min_turns", "prize_method", "starts_at", "winners"]);
    expect(reason).toMatch(/draw already ran/);
  });

  it("leaves locked fields out of an edit so a round trip through the form is not a change (#1019)", () => {
    const fields = { title: "T", starts_at: "s", ends_at: "e", winners: 3, prize_method: "draw" } as unknown as EventFields;
    expect(eventEditBody(fields, new Set(["starts_at", "winners"]))).toEqual({ title: "T", ends_at: "e", prize_method: "draw" });
  });

  it("allows deleting until the draw has run (#1019)", () => {
    expect(canDeleteEvent({ draw: null })).toBe(true);
    expect(canDeleteEvent({ draw: draw() })).toBe(true);
    expect(canDeleteEvent({ draw: draw({ drawn_at: "2026-11-23T00:00:00Z" }) })).toBe(false);
  });
});

describe("admin events: the picker's default (#1019)", () => {
  const e = (id: string, status: "upcoming" | "live" | "ended" | "drawn", starts_at: string) => ({ id, status, starts_at });
  it("opens the live event, else the soonest upcoming one, else the newest (#1019)", () => {
    const list = [e("far", "upcoming", "2026-12-20T00:00:00Z"), e("soon", "upcoming", "2026-11-22T00:00:00Z"), e("now", "live", "2026-11-01T00:00:00Z"), e("old", "drawn", "2026-10-01T00:00:00Z")];
    expect(defaultEventId(list)).toBe("now");
    expect(defaultEventId(list.filter((x) => x.id !== "now"))).toBe("soon");
    expect(defaultEventId(list.filter((x) => x.status === "drawn" || x.status === "ended"))).toBe("old");
    expect(defaultEventId([])).toBeNull();
  });
});
