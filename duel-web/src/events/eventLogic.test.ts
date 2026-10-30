import { describe, expect, it } from "vitest";
import { bannerCta, closedNote, eventPhase, formatCountdown, formatWindow, progressLabel, staffNote, statusLine } from "./eventLogic";

const START = "2026-11-22T17:00:00Z";
const END = "2026-11-22T21:00:00Z";
const ev = { starts_at: START, ends_at: END, status: "upcoming" as const };
const at = (iso: string) => Date.parse(iso);

describe("Stress Test Sunday banner (#794)", () => {
  it("counts down in days and hours, then hours and minutes, rounding down (#794)", () => {
    expect(formatCountdown((3 * 24 + 4) * 3_600_000 + 59 * 60_000)).toBe("3d 4h");
    expect(formatCountdown(2 * 3_600_000 + 10 * 60_000 + 59_000)).toBe("2h 10m");
    expect(formatCountdown(12 * 60_000)).toBe("12m");
    expect(formatCountdown(59_999)).toBe("<1m");
  });

  it("flips from upcoming to live at the start and to ended at the end, and a drawn event stays drawn (#794)", () => {
    expect(eventPhase(ev, at("2026-11-22T16:59:59Z"))).toBe("upcoming");
    expect(eventPhase(ev, at(START))).toBe("live");
    expect(eventPhase(ev, at("2026-11-22T20:59:59Z"))).toBe("live");
    expect(eventPhase(ev, at(END))).toBe("ended");
    expect(eventPhase({ ...ev, status: "drawn" }, at("2026-11-22T18:00:00Z"))).toBe("drawn");
  });

  it("words each phase of the status line (#794)", () => {
    expect(statusLine(ev, at("2026-11-19T13:00:00Z"))).toBe("Starts in 3d 4h");
    expect(statusLine(ev, at("2026-11-22T18:49:30Z"))).toBe("Live now · ends in 2h 10m");
    expect(statusLine(ev, at("2026-11-22T22:00:00Z"))).toBe("Ended · winners drawn soon");
    expect(statusLine({ ...ev, status: "drawn" }, at("2026-11-23T22:00:00Z"))).toBe("Winners drawn");
  });

  it("shows progress capped at the requirement, so a fourth game does not read 4 of 3 (#794)", () => {
    const need = { min_games: 3, min_opponents: 2 };
    expect(progressLabel({ games: 2, opponents: 1, eligible: false }, need)).toBe("2 of 3 games · 1 of 2 opponents");
    expect(progressLabel({ games: 7, opponents: 5, eligible: true }, need)).toBe("3 of 3 games · 2 of 2 opponents");
  });

  it("offers Join to players, Sign in to visitors, and nothing once entries close (#794)", () => {
    const base = { ...ev, viewer: "player" as const, can_join: true, opted_in: false };
    expect(bannerCta(base, at("2026-11-20T00:00:00Z"))).toBe("join");
    expect(bannerCta({ ...base, viewer: "anonymous", can_join: false }, at("2026-11-20T00:00:00Z"))).toBe("signin");
    expect(bannerCta({ ...base, viewer: "guest", can_join: false }, at("2026-11-20T00:00:00Z"))).toBe("none");
    expect(bannerCta({ ...base, opted_in: true }, at("2026-11-20T00:00:00Z"))).toBe("joined");
    expect(bannerCta(base, at(END))).toBe("none");
    expect(bannerCta({ ...base, opted_in: true }, at(END))).toBe("joined");
  });

  it("writes the window in the viewer's time zone with the zone name (#794)", () => {
    expect(formatWindow(START, END, "en-US", "America/New_York")).toBe("Sun, Nov 22, 12:00 PM – 4:00 PM EST");
    expect(formatWindow(START, END, "en-US", "America/Los_Angeles")).toBe("Sun, Nov 22, 9:00 AM – 1:00 PM PST");
    expect(formatWindow(START, END, "en-US", "UTC")).toBe("Sun, Nov 22, 5:00 PM – 9:00 PM UTC");
  });

  it("tells guests why they cannot enter, and says closed only once the event is over (#822)", () => {
    const base = { ...ev, viewer: "guest" as const, can_join: false, opted_in: false, cant_join_reason: "Guests can't enter the giveaway" };
    const early = at("2026-11-01T00:00:00Z");
    expect(closedNote(base, early)).toBe("Guests can't enter");
    expect(closedNote({ ...base, viewer: "player", cant_join_reason: "Already full" }, early)).toBe("Already full");
    expect(closedNote({ ...base, viewer: "player", cant_join_reason: null }, early)).toBe("Entries closed");
    expect(closedNote(base, at(END))).toBe("Entries closed");
    expect(closedNote({ ...base, status: "drawn" }, early)).toBe("Entries closed");
  });

  it("lets staff join and tells them they are not eligible for prizes until the draw (#834)", () => {
    const staff = { ...ev, viewer: "staff" as const, can_join: true, opted_in: false };
    const early = at("2026-11-01T00:00:00Z");
    expect(bannerCta(staff, early)).toBe("join");
    expect(staffNote(staff, early)).toBe("You can play, but staff aren't eligible for prizes.");
    expect(staffNote({ ...staff, opted_in: true }, at("2026-11-22T18:00:00Z"))).toBe("You can play, but staff aren't eligible for prizes.");
    expect(staffNote({ ...staff, viewer: "player" }, early)).toBeNull();
    expect(staffNote({ ...staff, status: "drawn" }, early)).toBeNull();
  });
});
