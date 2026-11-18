// The spoken name of a card on the board or in hand: the card first, then what a player would read off it.
export function cardAriaLabel(o: {
  name: string;
  power?: number | null;
  cost?: number | null;
  rested?: boolean;
  attachedDon?: number;
}): string {
  const parts = [o.name];
  if (o.power != null) parts.push(`power ${o.power}`);
  if (o.cost != null) parts.push(`cost ${o.cost}`);
  if (o.attachedDon) parts.push(`${o.attachedDon} DON!! attached`);
  if (o.rested) parts.push("rested");
  return parts.join(", ");
}
