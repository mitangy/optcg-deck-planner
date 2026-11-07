import { useQueryClient } from "@tanstack/react-query";
import { ShoppingItem } from "../api";
import { OwnedStepper, WantStepper } from "../OwnedCells";
import { applyOwnedOptimistic, applyWantOptimistic } from "../cache/optimistic";

export function OwnedInput({
  cardId,
  value,
  onSaved,
  compact = false,
  name,
}: {
  cardId: string;
  value: number;
  onSaved: () => void;
  compact?: boolean;
  name?: string;
}) {
  const qc = useQueryClient();
  return (
    <OwnedStepper
      cardId={cardId}
      value={value}
      onSaved={onSaved}
      applyOptimistic={(id, qty) => applyOwnedOptimistic(qc, id, qty)}
      compact={compact}
      name={name}
    />
  );
}

export function WantInput({ item, onSaved }: { item: ShoppingItem; onSaved: () => void }) {
  const qc = useQueryClient();
  return (
    <WantStepper
      cardId={item.card_id}
      name={item.name}
      need={item.need}
      deckNeed={item.deck_need ?? 0}
      extraQty={item.extra_qty ?? 0}
      applyOptimistic={(id, qty) => applyWantOptimistic(qc, id, qty)}
      onSaved={onSaved}
    />
  );
}
