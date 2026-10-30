import type { Seat, SeatSkin } from "../net/protocol";

export type SideSkin = { playmat: string | null; cardBack: string | null; donArt: number | null };

export type SideSkins = { near: SideSkin; far: SideSkin };

/**
 * Playmat / card back / DON!! art for each half of the board.
 * - Practice (hotseat): both halves are yours.
 * - Playing online: your half is yours; the opponent's half is the art they
 *   shared through the game server.
 * - Spectating: neither half is yours, so each shows its seated player's art.
 *
 * Other players' playmat and card back are uploads, so `showOthersArt: false`
 * (the viewer's setting) or a seat in `hiddenSeats` (hidden for this match only)
 * swaps them for the defaults (null). DON!! art is a pick of official card art,
 * so it always shows. Your own half is never affected (#812).
 */
export function sideSkins(opts: {
  own: SideSkin;
  seatSkins: readonly [SeatSkin | null, SeatSkin | null] | undefined;
  nearSeat: Seat;
  farSeat: Seat;
  hotseat: boolean;
  spectating: boolean;
  /** The viewer's setting; false hides every other player's playmat and card back. Default true. */
  showOthersArt?: boolean;
  /** Seats whose playmat and card back the viewer hid for this match. */
  hiddenSeats?: ReadonlySet<Seat>;
}): SideSkins {
  const { own, seatSkins, nearSeat, farSeat, hotseat, spectating, showOthersArt = true, hiddenSeats } = opts;
  const shared = (seat: Seat) => {
    const show = showOthersArt && !hiddenSeats?.has(seat);
    return {
      playmat: show ? seatSkins?.[seat]?.playmat ?? null : null,
      cardBack: show ? seatSkins?.[seat]?.cardBack ?? null : null,
      donArt: seatSkins?.[seat]?.donArt ?? null,
    };
  };
  if (hotseat) return { near: own, far: own };
  return {
    near: spectating ? shared(nearSeat) : own,
    far: shared(farSeat),
  };
}
