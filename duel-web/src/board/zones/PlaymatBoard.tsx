import type { ReactNode, RefObject } from "react";
import type { Intent, PlayerView, Seat, SeatPlayers } from "../../net/protocol";
import type { DuelSettings } from "../../settings";
import type { DragPayload } from "../combat/dragIntents";
import type { useDefendFlow } from "../combat/useDefendFlow";
import type { useDonSelection } from "../don/useDonSelection";
import { EMPTY_IDS } from "../don/useDonSelection";
import type { useBoardSelection } from "../input/useBoardSelection";
import type { useBoardPanels } from "../panels/useBoardPanels";
import type { dockIntents } from "../prompts/primaryIntent";
import type { DefendModel } from "../combat/defendModel";
import type { SideSkins } from "../layout/seatSkins";
import type { spectatorFans } from "../hand/handLayout";
import { SidePanel } from "../panels/SidePanels";
import { OppHandCorner, OppHandHint } from "../panels/TurnStatusPanel";
import { PrimaryDock } from "../prompts/PrimaryDock";
import { MulliganHand } from "../prompts/MulliganHand";
import { DockHeading } from "../combat/DockHeading";
import { RotateHint } from "../layout/RotateHint";
import { SpectatorFarHand } from "../hand/SpectatorFarHand";
import { endTurnWarning } from "../settings/gameplayPrefs";
import { seatLabel } from "../match/playerNames";
import { SideField } from "./SideField";

export type PlaymatBoardProps = {
  playmatRef: RefObject<HTMLDivElement | null>;
  view: PlayerView;
  prefs: DuelSettings;
  players: SeatPlayers | null;
  boardSeat: Seat;
  oppSeat: Seat;
  viewingSeat: Seat | undefined;
  firstSeat: Seat;
  youFirst: boolean;
  youActive: boolean;
  oppActive: boolean;
  spectating: boolean;
  isReplay: boolean;
  over: boolean;
  wide: boolean;
  lp: boolean;
  portraitMat: boolean;
  simpleOwnBoard: boolean;
  docked: boolean;
  sideActions: boolean;
  mulliganBody: ReactNode;
  mulligan: { deciding: boolean; order: ReactNode; hint: string | null };
  dockHeading: DefendModel | null;
  specFans: ReturnType<typeof spectatorFans>;
  farHand: NonNullable<PlayerView["revealedHands"]>[Seat] | undefined;
  oppHandOnMat: DuelSettings["oppHandSpot"] | null;
  oppHandRight: boolean;
  shownFarHand: React.ComponentProps<typeof OppHandCorner>["cards"];
  oppCardBackUrl: string | null;
  oppMatUrl: string | null;
  farDonUrl: string | undefined;
  nearDonUrl: string | undefined;
  skins: SideSkins;
  lifeFaceUp: (seat: Seat, fallback: PlayerView["opponent"]["faceUpLife"]) => PlayerView["opponent"]["faceUpLife"];
  panelDrag: ReturnType<typeof useBoardPanels>["panelDrag"];
  midline: { shown: string | null; strip: string | null; battle: boolean; title: string | null | undefined };
  rotateHintShown: boolean;
  closeRotateHint: () => void;
  dndEnabled: boolean;
  dragPayload: DragPayload | null;
  setDragPayload: (payload: DragPayload | null) => void;
  selectedBoardId: string | null;
  counterDefenderId: string | null;
  sel: ReturnType<typeof useBoardSelection>;
  don: ReturnType<typeof useDonSelection>;
  intentDock: {
    dock: ReturnType<typeof dockIntents>;
    mulliganDock: ReturnType<typeof dockIntents>;
    cardIntentCount: number;
    oppWait: React.ComponentProps<typeof PrimaryDock>["waiting"];
    defendPrimary: ReturnType<typeof useDefendFlow>["defendPrimary"];
    counterLabel: ReturnType<typeof useDefendFlow>["counterLabel"];
    onSend: (intent: Intent) => void;
  };
};

// The two sides of the mat with the midline prompt between them, plus the docked action strip beside the mat.
export function PlaymatBoard({
  playmatRef,
  view,
  prefs,
  players,
  boardSeat,
  oppSeat,
  viewingSeat,
  firstSeat,
  youFirst,
  youActive,
  oppActive,
  spectating,
  isReplay,
  over,
  wide,
  lp,
  portraitMat,
  simpleOwnBoard,
  docked,
  sideActions,
  mulliganBody,
  mulligan,
  dockHeading,
  specFans,
  farHand,
  oppHandOnMat,
  oppHandRight,
  shownFarHand,
  oppCardBackUrl,
  oppMatUrl,
  farDonUrl,
  nearDonUrl,
  skins,
  lifeFaceUp,
  panelDrag,
  midline,
  rotateHintShown,
  closeRotateHint,
  dndEnabled,
  dragPayload,
  setDragPayload,
  selectedBoardId,
  counterDefenderId,
  sel,
  don,
  intentDock,
}: PlaymatBoardProps) {
  const you = view.you;
  const opp = view.opponent;
  const playmatDim = prefs.playmatDim;
  const playmatOpacity = prefs.playmatOpacity;
  const { attackTargetIds, selectAttackTarget, selectBoardCard, actionableBoardIds, attackReadyIds, draggableAttackerIds, commitDrop, playTrashHighlightIds, playFieldHighlight } = sel;
  const { donPiles, moveDonToPile, draggableDonIds, selectedDonIds, setSelectedDonIds, setPendingAttach, toggleDonSelect, clearDonSelection, giveDonHighlightIds } = don;
  const { shown: midlineShown, strip: stripText, battle: midlineBattle, title: midlineTitle } = midline;
  const { dock, mulliganDock, cardIntentCount, oppWait, defendPrimary, counterLabel, onSend: sendPrimary } = intentDock;
  return (
    <div className="playmat" ref={playmatRef} data-mat-drop={wide && !lp ? "" : undefined}>
      {mulliganBody && !sideActions ? (
        <div className="mulligan-banner" role="status">
          {mulliganBody}
        </div>
      ) : null}
      {mulligan.deciding ? (
        <MulliganHand
          cards={you.hand}
          ownerSeat={boardSeat}
          viewingSeat={viewingSeat}
          showCounter={prefs.handCounters}
          order={mulligan.order}
          hint={mulligan.hint}
          actions={
            <PrimaryDock
              inline
              primary={mulliganDock.primary}
              extras={mulliganDock.extras}
              keyOffset={cardIntentCount}
              waiting={null}
              view={view}
              disabled={over}
              onSend={sendPrimary}
            />
          }
        />
      ) : null}
      <div className="playmat-inner">
        {farHand && specFans === "portrait" ? (
          <SpectatorFarHand cards={farHand} ownerSeat={oppSeat} mode="portrait" name={seatLabel(players, oppSeat)} />
        ) : farHand && specFans === "desktop" ? null : oppHandOnMat ? (
          <div
            className={`opp-hand-mat opp-hand-mat-${oppHandOnMat}${oppHandOnMat === "centre" ? "" : " opp-hand-mat-side"}`}
          >
            <SidePanel
              id="oppHand"
              dragging={panelDrag.draggingId === "oppHand"}
              grip={prefs.layoutGrips ? panelDrag.gripProps("oppHand") : null}
            >
              <OppHandCorner count={opp.handCount} cardBackUrl={oppCardBackUrl} variant="mat" cards={shownFarHand} ownerSeat={oppSeat} />
            </SidePanel>
          </div>
        ) : oppHandRight ? (
          <div className="opp-hand-hint opp-hand-hint-right">
            <OppHandCorner count={opp.handCount} cardBackUrl={oppCardBackUrl} variant="row" cards={shownFarHand} ownerSeat={oppSeat} />
          </div>
        ) : (
          <OppHandHint count={opp.handCount} cardBackUrl={oppCardBackUrl} cards={shownFarHand} ownerSeat={oppSeat} />
        )}

        <SideField
          side="opp"
          lifeFan={prefs.lifeFan}
          compact
          countRow={portraitMat}
          turnOrder={firstSeat === oppSeat ? "first" : "second"}
          activeTurn={oppActive}
          matImageUrl={oppMatUrl}
          cardBackUrl={oppCardBackUrl}
          donArtUrl={farDonUrl}
          matDim={playmatDim}
          matOpacity={playmatOpacity}
          ownerSeat={oppSeat}
          viewingSeat={viewingSeat}
          data={{
            leader: opp.leader,
            characters: opp.characters,
            stage: opp.stage,
            deckCount: opp.deckCount,
            trash: opp.trash,
            lifeCount: opp.lifeCount,
            faceUpLife: lifeFaceUp(oppSeat, opp.faceUpLife),
            donDeckCount: opp.donDeckCount,
            costAreaCount: opp.costAreaCount,
            activeDonCount: opp.activeDonCount,
          }}
          target={
            attackTargetIds.size > 0
              ? { targetableIds: attackTargetIds, onSelectTarget: selectAttackTarget }
              : undefined
          }
          battleDrop={
            dragPayload?.type === "attack"
              ? { kind: "attack", ids: attackTargetIds }
              : undefined
          }
        />

        <div className={`midline${docked && stripText ? " midline-docked" : ""}`}>
          {stripText ? (
            <div className={`prompt${midlineBattle ? " prompt-battle" : ""}`} title={midlineTitle ?? undefined}>
              <span className="prompt-text">{stripText}</span>
            </div>
          ) : rotateHintShown ? (
            <RotateHint onClose={closeRotateHint} />
          ) : null}
        </div>

        <SideField
          side="you"
          lifeFan={prefs.lifeFan}
          compact={simpleOwnBoard}
          countRow={simpleOwnBoard}
          turnOrder={youFirst ? "first" : "second"}
          activeTurn={youActive}
          matImageUrl={skins.near.playmat}
          matDim={playmatDim}
          matOpacity={playmatOpacity}
          cardBackUrl={skins.near.cardBack}
          donArtUrl={nearDonUrl}
          ownerSeat={boardSeat}
          viewingSeat={viewingSeat}
          data={{
            leader: you.leader,
            characters: you.characters,
            stage: you.stage,
            deckCount: you.deckCount,
            trash: you.trash,
            lifeCount: you.lifeCount,
            faceUpLife: lifeFaceUp(boardSeat, you.faceUpLife),
            donDeckCount: you.donDeckCount,
            costArea: you.costArea,
            activeDonCount: you.activeDonCount,
          }}
          donPile={
            spectating
              ? undefined
              : { piles: donPiles, onMove: moveDonToPile }
          }
          select={
            spectating
              ? undefined
              : {
                  selectedId: selectedBoardId,
                  onSelect: selectBoardCard,
                  actionableIds: actionableBoardIds,
                }
          }
          attackReadyIds={attackReadyIds}
          attackDrag={
            draggableAttackerIds.size > 0
              ? {
                  draggableIds: draggableAttackerIds,
                  onDragStart: (id) => setDragPayload({ type: "attack", attackerId: id }),
                  onDragEnd: (id, x, y) =>
                    commitDrop({ type: "attack", attackerId: id }, x, y),
                  onDragCancel: () => setDragPayload(null),
                }
              : undefined
          }
          battleDrop={
            dragPayload?.type === "counter" && counterDefenderId
              ? { kind: "counter", ids: new Set([counterDefenderId]) }
              : undefined
          }
          drag={
            dndEnabled
              ? {
                  draggableDonIds,
                  draggingDonIds:
                    dragPayload?.type === "give_don"
                      ? new Set(dragPayload.donIds)
                      : EMPTY_IDS,
                  selectedDonIds,
                  onDonDragStart: (donId) => {
                    const donIds =
                      selectedDonIds.size > 0 && selectedDonIds.has(donId)
                        ? Array.from(selectedDonIds)
                        : [donId];
                    setSelectedDonIds(new Set(donIds));
                    setPendingAttach(null);
                    setDragPayload({ type: "give_don", donIds });
                  },
                  onDonDragEnd: (donId, x, y) => {
                    const donIds =
                      dragPayload?.type === "give_don" ? dragPayload.donIds : [donId];
                    commitDrop({ type: "give_don", donIds }, x, y);
                  },
                  onDonDragCancel: () => setDragPayload(null),
                  onDonToggleSelect: toggleDonSelect,
                  onClearDonSelection: clearDonSelection,
                  giveDonHighlightIds,
                  playTrashHighlightIds,
                  playFieldHighlight,
                }
              : undefined
          }
        />
      </div>
      {sideActions && !mulligan.deciding ? (
        <div className="side-dock" data-side-dock>
          <PrimaryDock
            inline
            primary={over ? null : dock.primary}
            extras={over ? [] : dock.extras}
            keyOffset={cardIntentCount}
            waiting={oppWait}
            view={view}
            disabled={over}
            confirmEndTurn={endTurnWarning(isReplay ? "never" : prefs.endTurnConfirm, view.legalIntents)}
            defend={defendPrimary}
            counterLabel={counterLabel}
            onSend={sendPrimary}
          />
          {dockHeading ? <DockHeading model={dockHeading} /> : null}
          <div className="dock-caption" role="status">
            {mulliganBody ? (
              <p className="dock-caption-mulligan">{mulliganBody}</p>
            ) : midlineShown && !(dockHeading && midlineBattle) ? (
              <div className={`prompt${midlineBattle ? " prompt-battle" : ""}`} title={midlineTitle ?? undefined}>
                <span className="prompt-text">{midlineShown}</span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
