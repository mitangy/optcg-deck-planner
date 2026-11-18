import type { PlayerView, Seat } from "../../net/protocol";
import type { GhostPayload } from "../BoardOverlays";
import type { DragPayload } from "./dragIntents";

// The card (or DON!! stack) that follows the pointer while dragging, none while the hand reorders in place.
export function ghostPayloadFor({
  reorderInHand,
  liftedHandId,
  dragPayload,
  you,
  mySeat,
  view,
}: {
  reorderInHand: boolean;
  liftedHandId: string | null;
  dragPayload: DragPayload | null;
  you: PlayerView["you"];
  mySeat: Seat | null;
  view: PlayerView;
}): GhostPayload | null {
  const ghostPayload: GhostPayload | null =
    reorderInHand || liftedHandId != null
    ?
      null
    : dragPayload?.type === "give_don"
      ? { type: "give_don", count: dragPayload.donIds.length }
      : (dragPayload?.type === "play_card" || dragPayload?.type === "counter") &&
          you.hand[dragPayload.handIndex]
        ? {
            type: dragPayload.type,
            defId: you.hand[dragPayload.handIndex]!.defId,
            artCopy: you.hand[dragPayload.handIndex]!.artCopy,
            ownerSeat: mySeat ?? view.seat,
          }
        :
          null;
  return ghostPayload;
}
