import type { Seat, SeatSkin } from "../../net/protocol";

export type SideSkin = { playmat: string | null; cardBack: string | null; donArt: number | null };

export type SideSkins = { near: SideSkin; far: SideSkin };

export function sideSkins(opts: {
  own: SideSkin;
  seatSkins: readonly [SeatSkin | null, SeatSkin | null] | undefined;
  nearSeat: Seat;
  farSeat: Seat;
  hotseat: boolean;
  spectating: boolean;
  showOthersArt?: boolean;
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
