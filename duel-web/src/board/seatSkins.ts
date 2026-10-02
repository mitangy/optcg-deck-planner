import type { Seat, SeatSkin } from "../net/protocol";

export type SideSkins = {
  near: { playmat: string | null; cardBack: string | null };
  far: { playmat: string | null; cardBack: string | null };
};

/**
 * Playmat / card back for each half of the board.
 * - Practice (hotseat): both halves are yours.
 * - Playing online: your half is yours; the opponent's half is the art they
 *   shared through the game server.
 * - Spectating: neither half is yours, so each shows its seated player's art.
 */
export function sideSkins(opts: {
  own: { playmat: string | null; cardBack: string | null };
  seatSkins: readonly [SeatSkin | null, SeatSkin | null] | undefined;
  nearSeat: Seat;
  farSeat: Seat;
  hotseat: boolean;
  spectating: boolean;
}): SideSkins {
  const { own, seatSkins, nearSeat, farSeat, hotseat, spectating } = opts;
  const shared = (seat: Seat) => ({
    playmat: seatSkins?.[seat]?.playmat ?? null,
    cardBack: seatSkins?.[seat]?.cardBack ?? null,
  });
  if (hotseat) return { near: own, far: own };
  return {
    near: spectating ? shared(nearSeat) : own,
    far: shared(farSeat),
  };
}
