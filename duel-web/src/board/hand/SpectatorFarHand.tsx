import type { CSSProperties } from "react";
import type { Seat } from "../../net/protocol";
import { CardTile } from "../zones/CardTile";
import { HandLabel } from "./HandLabel";
import { spectatorHandGrid, type SpectatorFans } from "./handLayout";

type HandCard = { id: string; defId: string; artCopy?: number };

export function SpectatorFarHand({
  cards,
  ownerSeat,
  mode,
  name,
}: {
  cards: readonly HandCard[];
  ownerSeat: Seat;
  mode: Exclude<SpectatorFans, "desktop">;
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
          <CardTile key={c.id} defId={c.defId} artCopy={c.artCopy} ownerSeat={ownerSeat} inspectOnClick />
        ))}
      </div>
    </section>
  );
}
