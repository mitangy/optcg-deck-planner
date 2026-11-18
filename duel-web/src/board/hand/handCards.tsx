import type { CSSProperties, ReactNode } from "react";
import type {
  Intent,
  PlayerView,
  Seat,
} from "../../net/protocol";
import type { DuelSettings } from "../../settings";
import { lookupCard } from "../../cards/atlas";
import { cardBackCssValue } from "../../cardBack";
import { canDragCounter, canDragHandCard, type DragPayload } from "../combat/dragIntents";
import type { useDefendFlow } from "../combat/useDefendFlow";
import type { SideSkins } from "../layout/seatSkins";
import { CardTile } from "../zones/CardTile";
import { handCardOutOfReach } from "./handAffordance";
import { fanPoseStyle } from "./handFanGeometry";
import type { useHandReorder } from "./useHandReorder";

export type HandCardsCtx = {
  view: PlayerView;
  you: PlayerView["you"];
  prefs: DuelSettings;
  spectating: boolean;
  nearHand: readonly { id: string; defId: string; artCopy?: number }[] | undefined;
  skins: SideSkins;
  boardSeat: Seat;
  viewingSeat: Seat | undefined;
  intents: Intent[];
  yourTurn: boolean;
  handPick: boolean;
  handSorted: boolean;
  handDisplayIndices: readonly number[] | null | undefined;
  handReorder: ReturnType<typeof useHandReorder>;
  handFilter: number | null;
  myRevealed: ReadonlySet<string>;
  liftedHandId: string | null;
  setLiftedHandId: (id: string | null) => void;
  dndEnabled: boolean;
  counterDragEnabled: boolean;
  defend: ReturnType<typeof useDefendFlow>["defend"];
  earlyCounterIds: ReadonlySet<string>;
  selectHandCard: (idx: number) => void;
  setDragPayload: (payload: DragPayload | null) => void;
  commitDrop: (payload: DragPayload, clientX: number, clientY: number) => void;
};

// The cards of the player's hand (or a spectated seat's) as draggable tiles, optionally posed along the fan.
export function renderHandCardsFor(ctx: HandCardsCtx, fanned = false): ReactNode {
  const {
    view,
    you,
    prefs,
    spectating,
    nearHand,
    skins,
    boardSeat,
    viewingSeat,
    intents,
    yourTurn,
    handPick,
    handSorted,
    handDisplayIndices,
    handReorder,
    handFilter,
    myRevealed,
    liftedHandId,
    setLiftedHandId,
    dndEnabled,
    counterDragEnabled,
    defend,
    earlyCounterIds,
    selectHandCard,
    setDragPayload,
    commitDrop,
  } = ctx;
  function reorderMarker(ids: readonly string[]): { id: string; cls: string } | null {
    const r = handReorder.reorder;
    if (handSorted || !r || r.slot == null) return null;
    const others = ids.filter((id) => id !== r.cardId);
    if (others.length === 0 || ids.indexOf(r.cardId) === r.slot) return null;
    return r.slot < others.length
      ? { id: others[r.slot]!, cls: "hand-drop-before" }
      : { id: others[others.length - 1]!, cls: "hand-drop-after" };
  }

    const pose = (i: number, n: number): CSSProperties | undefined => (fanned ? fanPoseStyle(i, n) : undefined);
    if (spectating && nearHand) {
      return nearHand.map((c, i) => (
        <CardTile
          key={c.id}
          motionId={c.id}
          defId={c.defId}
          artCopy={c.artCopy}
          showCounter={prefs.handCounters}
          inspectOnClick
          ownerSeat={boardSeat}
          style={pose(i, nearHand.length)}
        />
      ));
    }
    if (spectating) {
      const n = Math.min(you.handCount ?? 0, 8);
      const back = skins.near.cardBack
        ? ({ "--card-back-art": cardBackCssValue(skins.near.cardBack) } as CSSProperties)
        : undefined;
      return Array.from({ length: n }).map((_, i) => (
        <span key={i} className="card-back hand-back" style={{ ...back, ...pose(i, n) }} />
      ));
    }
    const order = handDisplayIndices ?? you.hand.map((_, i) => i);
    const reorderable = !handSorted;
    const marker = reorderMarker(order.map((i) => you.hand[i]!.id));
    return order.map((idx, pos) => {
      const c = you.hand[idx]!;
      const playable = dndEnabled && canDragHandCard(intents, idx);
      const counterable =
        !playable &&
        counterDragEnabled &&
        (defend?.phase === "block" ? earlyCounterIds.has(c.id) : canDragCounter(intents, idx));
      const boardDrag = playable || counterable;
      const cost = c.playCost ?? lookupCard(c.defId).cost;
      const unaffordable = handCardOutOfReach({
        dimSetting: prefs.dimUnplayable,
        mainPhase: yourTurn && view?.phase === "main",
        picking: !!handPick,
        playable,
        cost,
        activeDon: you.activeDonCount,
        blocked: c.blocked,
      });
      const payload: DragPayload = counterable
        ? { type: "counter", handIndex: idx }
        : { type: "play_card", handIndex: idx };
      return (
        <CardTile
          key={c.id}
          motionId={c.id}
          defId={c.defId}
          artCopy={c.artCopy}
          playCost={c.playCost}
          blocked={yourTurn && view?.phase === "main" ? c.blocked : undefined}
          showCounter={prefs.handCounters}
          selected={handFilter === idx}
          onClick={() => selectHandCard(idx)}
          instantClick={!prefs.oneTapActions}
          dragEnabled={boardDrag || reorderable}
          dragPayload={payload}
          onDragStart={() => {
            setLiftedHandId(c.id);
            handReorder.begin(c.id);
            if (boardDrag) setDragPayload(payload);
          }}
          onDragEnd={(x, y) => {
            setLiftedHandId(null);
            if (handReorder.end(x, y, reorderable)) setDragPayload(null);
            else if (boardDrag) commitDrop(payload, x, y);
          }}
          onDragCancel={() => {
            setLiftedHandId(null);
            handReorder.cancel();
            setDragPayload(null);
          }}
          ownerSeat={boardSeat}
          viewingSeat={viewingSeat}
          revealed={myRevealed.has(c.id)}
          classNameExtra={[unaffordable ? "hand-unaffordable" : "", myRevealed.has(c.id) ? "hand-revealed" : "", marker?.id === c.id ? marker.cls : "", liftedHandId === c.id ? "card-lifted" : ""].filter(Boolean).join(" ") || undefined}
          style={pose(pos, order.length)}
        />
      );
    });
  }
