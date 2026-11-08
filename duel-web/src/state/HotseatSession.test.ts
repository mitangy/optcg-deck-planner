import { describe, expect, it, vi } from "vitest";
import type { DuelClient } from "../net/duelClient";
import type { PlayerView } from "../net/protocol";
import { coalesced, HotseatSession } from "./HotseatSession";
import { createMatchStore } from "./matchStore";

describe("practice render batching", () => {
  it("both seats' view updates in one burst notify the page once, after the burst (#725)", async () => {
    const notify = vi.fn();
    const bump = coalesced(notify);
    bump();
    bump();
    expect(notify).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 20));
    expect(notify).toHaveBeenCalledTimes(1);
    bump();
    await new Promise((r) => setTimeout(r, 20));
    expect(notify).toHaveBeenCalledTimes(2);
  });
});

describe("practice auto-pass", () => {
  const choiceForSeat1 = (seat: 0 | 1) =>
    ({
      seat,
      turnNumber: 3,
      phase: "main",
      pendingChoices: [{ id: "c1", seat: 1 }],
      you: { mulliganDone: true },
    }) as unknown as PlayerView;

  function practice() {
    const host = { setMatchId() {}, setResuming() {}, setReady() {}, setBootError() {}, setBootPhase() {}, setTakenOver() {} };
    const session = new HotseatSession(host, { routeNav: null, resume: null });
    const seats = ([0, 1] as const).map((seat) => ({ client: {} as DuelClient, seat, store: createMatchStore("hotseat", { seat }) }));
    session.seats = [seats[0]!, seats[1]!];
    for (const s of seats) session.attach(s);
    session.markReady(true);
    return { session, seats };
  }

  it("moves the device to the seat that must act as its view lands, before the page renders it (#725)", () => {
    const { session, seats } = practice();
    expect(session.activeSeat).toBe(0);
    // The copilot must never be shown seat 0's view of a choice that belongs to seat 1.
    seats[1]!.store.dispatch({ type: "view", view: choiceForSeat1(1) });
    expect(session.activeSeat).toBe(1);
  });
});
