import assert from "node:assert/strict";
import { SeatRegistry, type SeatClaim } from "../src/rooms/duel/seats.js";

const claim = (sessionId: string, userId: number): SeatClaim => ({
  sessionId,
  displayId: `u${userId}`,
  displayName: `User ${userId}`,
  userId,
});

describe("SeatRegistry", () => {
  it("seats a player on the preferred seat when it is free, else on the first free one (refactor 3.5b)", () => {
    const seats = new SeatRegistry();
    assert.equal(seats.assign(claim("a", 1), 1), 1);
    // Seat 1 is taken: a second player asking for it gets the other seat.
    assert.equal(seats.assign(claim("b", 2), 1), 0);
    assert.equal(seats.seatForSession("a"), 1);
    assert.equal(seats.seatForSession("b"), 0);
  });

  it("turns a third player away and finds nobody for an unknown session (refactor 3.5b)", () => {
    const seats = new SeatRegistry();
    seats.assign(claim("a", 1));
    seats.assign(claim("b", 2));
    assert.equal(seats.assign(claim("c", 3)), null);
    assert.equal(seats.seatForClient({ sessionId: "c" }), null);
    assert.equal(seats.filled(), 2);
    assert.equal(seats.bothFilled(), true);
  });

  it("frees only the seats the leaving session held, with their owner (refactor 3.5b)", () => {
    const seats = new SeatRegistry();
    seats.assign(claim("a", 1), 0);
    seats.assign(claim("b", 2), 1);
    seats.setOwner(0, 10);
    seats.setOwner(1, 20);
    assert.deepEqual(seats.release("a"), [0]);
    assert.equal(seats.slot(0), null);
    assert.equal(seats.slot(1)?.sessionId, "b");
    assert.deepEqual(seats.owners(), [null, 20]);
    assert.equal(seats.filled(), 1);
    assert.deepEqual(seats.release("a"), [], "a session that holds nothing frees nothing");
  });

  it("lets the seat's owner account control it, else the seat's own account (refactor 3.5b)", () => {
    const seats = new SeatRegistry();
    seats.assign(claim("a", 111), 0);
    seats.assign(claim("b", 222), 1);
    seats.setOwner(0, 5); // a practice seat: the guest id 111 is owned by account 5
    assert.equal(seats.controllerOf(0), 5);
    assert.equal(seats.controllerOf(1), 222, "no owner recorded: the seat's own account");
    seats.release("b");
    assert.equal(seats.controllerOf(1), null, "a free seat has no controller");
  });

  it("moves a seat to a new connection and ends its away window, keeping the player (refactor 3.5b)", () => {
    const seats = new SeatRegistry();
    seats.assign(claim("old", 1), 0);
    seats.markAway(0, 5000);
    assert.deepEqual(seats.awayUntil(), [5000, null]);
    assert.equal(seats.moveTo(0, "new"), "old");
    assert.equal(seats.seatForSession("new"), 0);
    assert.equal(seats.seatForSession("old"), null);
    assert.equal(seats.slot(0)?.userId, 1);
    assert.deepEqual(seats.awayUntil(), [null, null]);
  });

  it("keeps the server-side player's seat when the humans are sent home (refactor 3.5b)", () => {
    const seats = new SeatRegistry();
    seats.assign(claim("human", 1), 0);
    seats.occupy(1, claim("bot", -1));
    seats.clearHumans(1);
    assert.equal(seats.slot(0), null);
    assert.equal(seats.slot(1)?.sessionId, "bot");
    seats.clearHumans(null);
    assert.equal(seats.slot(1), null);
  });

  it("hands out a copy of the away deadlines (refactor 3.5b)", () => {
    const seats = new SeatRegistry();
    seats.markAway(1, 7);
    const snapshot = seats.awayUntil();
    seats.markBack(1);
    assert.deepEqual(snapshot, [null, 7]);
    assert.deepEqual(seats.awayUntil(), [null, null]);
  });
});
