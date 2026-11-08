import type { CSSProperties } from "react";
import type { Seat } from "../../net/protocol";
import { CardTile } from "../zones/CardTile";
import { HandLabel } from "./HandLabel";
import { spectatorHandGrid, type SpectatorFans } from "./handLayout";

type HandCard = { id: string; defId: string };

/**
 * The far player's hand for a spectator of an unranked room on a phone: a grid
 * of small upright cards, no overlap, tilt or drop: one scrolling row above
 * the top mat in portrait, a wrapping grid at the top of the right column in
 * landscape. (Desktop spectators get the match's `HandFan`, mirrored.)
 */
export function SpectatorFarHand({
  cards,
  ownerSeat,
  mode,
  name,
}: {
  cards: readonly HandCard[];
  ownerSeat: Seat;
  mode: Exclude<SpectatorFans, "desktop">;
  /** "Player 2": the label reads "Player 2 hand" */
  name: string;
}) {
  const n = cards.length;
  return (
    <section
      className={`spec-far spec-far-${mode}${spectatorHandGrid(mode) ? " spec-far-grid" : ""}`}
      style={{ "--n": Math.max(n, 1) } as CSSProperties}
      aria-label={`${name} hand: ${n} cards`}
    >
      <HandLabel name={name} count={n} />
      <div className="spec-far-cards">
        {cards.map((c) => (
          <CardTile key={c.id} defId={c.defId} ownerSeat={ownerSeat} inspectOnClick />
        ))}
      </div>
    </section>
  );
}
