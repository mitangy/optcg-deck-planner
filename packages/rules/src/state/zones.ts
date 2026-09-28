import type { CardInstance, PlayerState } from "../types.js";

export type LedgerZone = "deck" | "trash" | "life";
export type ZoneCard = Pick<CardInstance, "id" | "defId">;

/** Keep definition IDs and stable instance IDs together at every zone boundary. */
export function putInZone(player: PlayerState, zone: LedgerZone, card: ZoneCard, position: "top" | "bottom" = "bottom", faceUp = false): void {
  if (position === "top") {
    player[zone].unshift(card.defId);
    player.zoneInstanceIds[zone].unshift(card.id);
    if (zone === "life") player.faceUpLife.unshift(faceUp);
  } else {
    player[zone].push(card.defId);
    player.zoneInstanceIds[zone].push(card.id);
    if (zone === "life") player.faceUpLife.push(faceUp);
  }
}

export function takeFromZone(player: PlayerState, zone: LedgerZone, index: number): ZoneCard {
  if (!Number.isInteger(index) || index < 0 || index >= player[zone].length || !player.zoneInstanceIds[zone][index]) throw new Error(`Invalid ${zone} card index ${index}`);
  const [defId] = player[zone].splice(index, 1);
  const [id] = player.zoneInstanceIds[zone].splice(index, 1);
  if (zone === "life") player.faceUpLife.splice(index, 1);
  return { defId: defId!, id: id! };
}
