import type { Seat } from "@optcg/rules";
import type { SeatSlot } from "./context.js";

export type SeatClaim = Omit<SeatSlot, "seat">;

export class SeatRegistry {
  private slots: [SeatSlot | null, SeatSlot | null] = [null, null];
  private ownerUids: [number | null, number | null] = [null, null];
  private away: [number | null, number | null] = [null, null];

  slot(seat: Seat): SeatSlot | null {
    return this.slots[seat];
  }

  all(): readonly (SeatSlot | null)[] {
    return this.slots;
  }

  filled(): number {
    return (this.slots[0] ? 1 : 0) + (this.slots[1] ? 1 : 0);
  }

  bothFilled(): boolean {
    return this.slots[0] !== null && this.slots[1] !== null;
  }

  seatForSession(sessionId: string): Seat | null {
    for (const slot of this.slots) {
      if (slot && slot.sessionId === sessionId) return slot.seat;
    }
    return null;
  }

  seatForClient(client: { sessionId: string }): Seat | null {
    return this.seatForSession(client.sessionId);
  }

  occupy(seat: Seat, claim: SeatClaim): void {
    this.slots[seat] = { seat, ...claim };
  }

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

  setOwner(seat: Seat, uid: number): void {
    this.ownerUids[seat] = uid;
  }

  owners(): [number | null, number | null] {
    return [this.ownerUids[0], this.ownerUids[1]];
  }

  controllerOf(seat: Seat): number | null {
    const slot = this.slots[seat];
    if (!slot) return null;
    return this.ownerUids[seat] ?? slot.userId;
  }

  /** True for the account behind either seat, also while that seat is away: the slot stays until the grace ends. */
  holdsSeat(userId: number): boolean {
    return ([0, 1] as Seat[]).some((seat) => {
      const slot = this.slots[seat];
      return slot !== null && (slot.userId === userId || this.controllerOf(seat) === userId);
    });
  }

  moveTo(seat: Seat, sessionId: string): string {
    const slot = this.slots[seat]!;
    const old = slot.sessionId;
    slot.sessionId = sessionId;
    this.away[seat] = null;
    return old;
  }

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

  clearHumans(keep: Seat | null): void {
    this.slots = [keep === 0 ? this.slots[0] : null, keep === 1 ? this.slots[1] : null];
  }

  markAway(seat: Seat, until: number): void {
    this.away[seat] = until;
  }

  markBack(seat: Seat): void {
    this.away[seat] = null;
  }

  clearAway(): void {
    this.away = [null, null];
  }

  awayUntil(): [number | null, number | null] {
    return [this.away[0], this.away[1]];
  }
}
