import type { Seat } from "@optcg/rules";
import type { SeatSlot } from "./context.js";

/** What a seat needs to know about the connection that takes it. */
export type SeatClaim = Omit<SeatSlot, "seat">;

/**
 * Who holds each of the two seats: the connection (session id) and account behind it, the account
 * that controls it (who may take it over, #451), and which seats dropped and may still come back.
 * Pure bookkeeping: it never talks to a client, so DuelRoom decides what to tell whom.
 */
export class SeatRegistry {
  private slots: [SeatSlot | null, SeatSlot | null] = [null, null];
  /**
   * Account that controls each seat: the verified ownerToken uid (practice, where
   * seats are guest ids), else the seat's own userId.
   */
  private ownerUids: [number | null, number | null] = [null, null];
  /** Seats that dropped and may still reconnect, with their grace deadline. */
  private away: [number | null, number | null] = [null, null];

  /** The holder of `seat`, or null while it is free. */
  slot(seat: Seat): SeatSlot | null {
    return this.slots[seat];
  }

  /** Both seats in order (a free one is null). */
  all(): readonly (SeatSlot | null)[] {
    return this.slots;
  }

  /** How many seats are taken. */
  filled(): number {
    return (this.slots[0] ? 1 : 0) + (this.slots[1] ? 1 : 0);
  }

  bothFilled(): boolean {
    return this.slots[0] !== null && this.slots[1] !== null;
  }

  /** The seat the connection with this session id holds, or null. */
  seatForSession(sessionId: string): Seat | null {
    for (const slot of this.slots) {
      if (slot && slot.sessionId === sessionId) return slot.seat;
    }
    return null;
  }

  seatForClient(client: { sessionId: string }): Seat | null {
    return this.seatForSession(client.sessionId);
  }

  /** Put a connection on exactly `seat` (a paired ranked room reserves them), or the bot on its own. */
  occupy(seat: Seat, claim: SeatClaim): void {
    this.slots[seat] = { seat, ...claim };
  }

  /** Seat a connection: the preferred seat when it is free, else the first free one; null when full. */
  assign(claim: SeatClaim, preferred?: Seat): Seat | null {
    if ((preferred === 0 || preferred === 1) && !this.slots[preferred]) {
      this.occupy(preferred, claim);
      return preferred;
    }
    for (const seat of [0, 1] as Seat[]) {
      if (!this.slots[seat]) {
        this.occupy(seat, claim);
        return seat;
      }
    }
    return null;
  }

  /** Record the account that controls a seat. */
  setOwner(seat: Seat, uid: number): void {
    this.ownerUids[seat] = uid;
  }

  /** Who controls each seat, for the lobby's metadata. */
  owners(): [number | null, number | null] {
    return [this.ownerUids[0], this.ownerUids[1]];
  }

  /** The account that may take `seat` over: its owner, else the seat's own account. Null for a free seat. */
  controllerOf(seat: Seat): number | null {
    const slot = this.slots[seat];
    if (!slot) return null;
    return this.ownerUids[seat] ?? slot.userId;
  }

  /** Move a seat to another connection. Returns the connection it left; the seat is no longer away. */
  moveTo(seat: Seat, sessionId: string): string {
    const slot = this.slots[seat]!;
    const old = slot.sessionId;
    slot.sessionId = sessionId;
    this.away[seat] = null;
    return old;
  }

  /** Free every seat this connection holds. Returns the seats it freed. */
  release(sessionId: string): Seat[] {
    const freed: Seat[] = [];
    for (const seat of [0, 1] as Seat[]) {
      const slot = this.slots[seat];
      if (slot && slot.sessionId === sessionId) {
        this.slots[seat] = null;
        this.ownerUids[seat] = null;
        freed.push(seat);
      }
    }
    return freed;
  }

  /** The game could not start: send the people home, keeping the server-side player's seat when there is one. */
  clearHumans(keep: Seat | null): void {
    this.slots = [keep === 0 ? this.slots[0] : null, keep === 1 ? this.slots[1] : null];
  }

  /** `seat` dropped and may reclaim it until `until` (ms since the epoch). */
  markAway(seat: Seat, until: number): void {
    this.away[seat] = until;
  }

  markBack(seat: Seat): void {
    this.away[seat] = null;
  }

  clearAway(): void {
    this.away = [null, null];
  }

  /** The reclaim deadline per seat (null: connected), as presence sends it. */
  awayUntil(): [number | null, number | null] {
    return [this.away[0], this.away[1]];
  }
}
