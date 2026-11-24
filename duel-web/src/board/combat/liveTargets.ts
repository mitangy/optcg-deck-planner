import { createContext, useContext } from "react";
import type { CardView, PlayerView, Seat } from "../../net/protocol";

export type LiveCard = CardView & {
  seat: Seat;
  zone: "leader" | "character" | "stage";
  slot?: number;
};

export function indexLiveCards(view: PlayerView | null | undefined): Map<string, LiveCard> {
  const out = new Map<string, LiveCard>();
  if (!view) return out;
  const youSeat: Seat = view.seat === 1 ? 1 : 0;
  const sides = [
    [view.you, youSeat],
    [view.opponent, (youSeat === 0 ? 1 : 0) as Seat],
  ] as const;
  for (const [side, seat] of sides) {
    out.set(side.leader.id, { ...side.leader, seat, zone: "leader" });
    side.characters.forEach((c, i) => out.set(c.id, { ...c, seat, zone: "character", slot: i + 1 }));
    if (side.stage) out.set(side.stage.id, { ...side.stage, seat, zone: "stage" });
  }
  return out;
}

export function readinessLabel(card: LiveCard): string | null {
  if (card.zone === "stage") return card.rested ? "Rested" : "Active";
  if (card.rested) return "Rested";
  if (card.zone === "character" && (card.summoningSick || card.statusLabels?.includes("Summoning sick"))) {
    return "Summoning sick";
  }
  return card.zone === "leader" ? "Active" : "Can attack";
}

export const LiveCardsContext = createContext<Map<string, LiveCard>>(new Map());

export function useLiveCard(instanceId: string | undefined): LiveCard | null {
  const map = useContext(LiveCardsContext);
  return instanceId ? map.get(instanceId) ?? null : null;
}
