import type { CSSProperties, ReactNode } from "react";
import type { PlayerView, Seat } from "../../net/protocol";
import { CardTile } from "../zones/CardTile";

type Props = {
  cards: PlayerView["you"]["hand"];
  ownerSeat: Seat;
  viewingSeat?: Seat | null;
  showCounter: boolean;
  // Who goes first and what that means for turn 1.
  order: ReactNode;
  // The keep or mulligan sentence (only when game hints are on).
  hint: ReactNode;
  // Mulligan and Keep opening hand, directly under the cards.
  actions: ReactNode;
};

// The opening hand, large and centred over the board while you decide; the board is not played yet, so the cards are for reading, not dragging.
export function MulliganHand({ cards, ownerSeat, viewingSeat, showCounter, order, hint, actions }: Props) {
  return (
    <section className="mulligan-hand" style={{ "--mh-n": cards.length } as CSSProperties} aria-label={`Your opening hand: ${cards.length} cards`}>
      <h2 className="mulligan-hand-title">Your opening hand</h2>
      <p className="mulligan-hand-order">{order}</p>
      {hint ? <p className="mulligan-hand-hint">{hint}</p> : null}
      <div className="mulligan-hand-cards">
        {cards.map((c) => (
          <CardTile
            key={c.id}
            defId={c.defId}
            artCopy={c.artCopy}
            showCounter={showCounter}
            inspectOnClick
            ownerSeat={ownerSeat}
            viewingSeat={viewingSeat ?? undefined}
          />
        ))}
      </div>
      <div className="mulligan-hand-actions">{actions}</div>
    </section>
  );
}
