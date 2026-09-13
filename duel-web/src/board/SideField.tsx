import { useState } from "react";
import type { CardView, Seat } from "../net/protocol";
import { CardTile } from "./CardTile";
import { DonStrip } from "./DonStrip";
import { TrashViewer, trashNewestFirst } from "./TrashViewer";
import { ZonePile } from "./ZonePile";

type SideData = {
  leader: CardView;
  characters: CardView[];
  stage: CardView | null;
  deckCount: number;
  trash: string[];
  lifeCount: number;
  donDeckCount: number;
  costArea?: { id: string; rested: boolean }[];
  costAreaCount?: number;
  activeDonCount: number;
  handCount?: number;
};

type DragHandlers = {
  draggableDonIds?: ReadonlySet<string>;
  /** DON!! ids currently carried by an in-progress drag. */
  draggingDonIds?: ReadonlySet<string>;
  /** DON!! ids toggled into the multi-select set. */
  selectedDonIds?: ReadonlySet<string>;
  onDonDragStart?: (donId: string) => void;
  onDonDragEnd?: (donId: string, clientX: number, clientY: number) => void;
  onDonDragCancel?: () => void;
  onDonToggleSelect?: (donId: string) => void;
  onClearDonSelection?: () => void;
  /** Instance ids highlighted as give_don drop targets. */
  giveDonHighlightIds?: ReadonlySet<string>;
  /** Character ids highlighted for play_card trash. */
  playTrashHighlightIds?: ReadonlySet<string>;
  /** Highlight stage + character zones for play_card field drop. */
  playFieldHighlight?: boolean;
};

/** Tap-select a leader/character on this side for contextual actions. */
type SelectHandlers = {
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Board ids that currently have a non-global legal action (discoverability hint). */
  actionableIds?: ReadonlySet<string>;
};

/** Tap a legal attack target on this side to declare the selected attack. */
type TargetHandlers = {
  targetableIds: ReadonlySet<string>;
  onSelectTarget: (id: string) => void;
};

type Props = {
  side: "you" | "opp";
  data: SideData;
  compact?: boolean;
  drag?: DragHandlers;
  /** Enables tap-to-select on this side's leader/characters. */
  select?: SelectHandlers;
  /** Enables tap-to-attack on this side's leader/characters (legal targets only). */
  target?: TargetHandlers;
  /** Seat that owns cards on this half of the board. */
  ownerSeat?: Seat;
  /** Seat controlling the UI (alt-art picker). */
  viewingSeat?: Seat;
};

export function SideField({
  side,
  data,
  compact,
  drag,
  select,
  target,
  ownerSeat,
  viewingSeat,
}: Props) {
  const mirrored = side === "opp";
  const interactive = side === "you" && drag;
  const [trashOpen, setTrashOpen] = useState(false);
  const trashTop = data.trash.length ? data.trash[data.trash.length - 1] : null;
  const trashTitle = side === "you" ? "Your trash" : "Opponent trash";

  return (
    <section className={`side-field side-${side}${mirrored ? " mirrored" : ""}`}>
      <div className="side-grid">
        <div className="zone-life">
          <ZonePile label="Life" count={data.lifeCount} variant="life" secret />
        </div>

        <div
          className={`zone-characters${
            interactive && drag?.playFieldHighlight ? " drop-highlight-zone" : ""
          }`}
          data-dnd-drop={interactive ? "play_field" : undefined}
        >
          <div className="zone-caption">Characters</div>
          <div className="card-row characters-row">
            {data.characters.map((c) => {
              const giveHl = Boolean(interactive && drag?.giveDonHighlightIds?.has(c.id));
              const trashHl = Boolean(interactive && drag?.playTrashHighlightIds?.has(c.id));
              let dropAttr: string | null = null;
              if (interactive) {
                if (drag?.giveDonHighlightIds?.has(c.id)) dropAttr = `give_don:${c.id}`;
                else if (drag?.playTrashHighlightIds?.has(c.id)) {
                  dropAttr = `play_trash:${c.id}`;
                }
              }
              const isSelectable = Boolean(select);
              const isTargetable = Boolean(target?.targetableIds.has(c.id));
              const isSelected = isSelectable && select!.selectedId === c.id;
              const isActionable = Boolean(select?.actionableIds?.has(c.id));
              const tapHandler = isSelectable
                ? () => select!.onSelect(c.id)
                : isTargetable
                  ? () => target!.onSelectTarget(c.id)
                  : undefined;
              const extraClass = [
                isTargetable ? "attack-target" : "",
                isActionable && !isSelected ? "has-actions" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <CardTile
                  key={c.id}
                  defId={c.defId}
                  compact={compact || mirrored}
                  rested={c.rested}
                  power={c.power}
                  printedPower={c.printedPower}
                  attachedDonCount={c.attachedDonCount}
                  statusLabels={c.statusLabels}
                  selected={isSelected}
                  classNameExtra={extraClass || undefined}
                  inspectOnClick={!tapHandler}
                  onClick={tapHandler}
                  dropAttr={dropAttr}
                  dropHighlight={giveHl || trashHl}
                  ownerSeat={ownerSeat}
                  viewingSeat={viewingSeat}
                />
              );
            })}
            {/* Exactly 5 slot cells total: real character tiles plus dashed
                fillers for the remainder. When there are zero characters this
                renders 5 filler slots (not an extra "empty" placeholder cell
                on top of 5 fillers). */}
            {Array.from({ length: Math.max(0, 5 - data.characters.length) }).map((_, i) => (
              <div
                key={`slot-${i}`}
                className={`zone-slot${data.characters.length === 0 && i === 0 ? " empty" : ""}`}
                aria-hidden
              >
                {data.characters.length === 0 && i === 0 ? "—" : null}
              </div>
            ))}
          </div>
        </div>

        <div className="zone-deck">
          <ZonePile label="Deck" count={data.deckCount} variant="deck" />
        </div>

        <div className="zone-leader">
          <div className="zone-caption">Leader</div>
          {(() => {
            const leaderId = data.leader.id;
            const isSelectable = Boolean(select);
            const isTargetable = Boolean(target?.targetableIds.has(leaderId));
            const isSelected = isSelectable && select!.selectedId === leaderId;
            const isActionable = Boolean(select?.actionableIds?.has(leaderId));
            const tapHandler = isSelectable
              ? () => select!.onSelect(leaderId)
              : isTargetable
                ? () => target!.onSelectTarget(leaderId)
                : undefined;
            const extraClass = [
              isTargetable ? "attack-target" : "",
              isActionable && !isSelected ? "has-actions" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <CardTile
                defId={data.leader.defId}
                compact={compact || mirrored}
                rested={data.leader.rested}
                power={data.leader.power}
                printedPower={data.leader.printedPower}
                attachedDonCount={data.leader.attachedDonCount}
                statusLabels={data.leader.statusLabels}
                frame="leader"
                selected={isSelected}
                classNameExtra={extraClass || undefined}
                inspectOnClick={!tapHandler}
                onClick={tapHandler}
                dropAttr={
                  interactive && drag?.giveDonHighlightIds?.has(leaderId)
                    ? `give_don:${leaderId}`
                    : null
                }
                dropHighlight={Boolean(interactive && drag?.giveDonHighlightIds?.has(leaderId))}
                ownerSeat={ownerSeat}
                viewingSeat={viewingSeat}
              />
            );
          })()}
        </div>

        <div
          className={`zone-stage${
            interactive && drag?.playFieldHighlight ? " drop-highlight-zone" : ""
          }`}
          data-dnd-drop={interactive ? "play_field" : undefined}
        >
          <div className="zone-caption">Stage</div>
          {data.stage ? (
            <CardTile
              defId={data.stage.defId}
              compact={compact || mirrored}
              rested={data.stage.rested}
              inspectOnClick
              ownerSeat={ownerSeat}
              viewingSeat={viewingSeat}
            />
          ) : (
            <div className="zone-slot stage-empty">Stage</div>
          )}
        </div>

        <div className="zone-don-deck">
          <ZonePile label="DON!! Deck" count={data.donDeckCount} variant="don" />
        </div>

        <div className="zone-cost">
          <DonStrip
            side={side}
            tokens={data.costArea}
            activeCount={data.activeDonCount}
            totalCount={data.costAreaCount ?? data.costArea?.length ?? 0}
            draggableDonIds={interactive ? drag?.draggableDonIds : undefined}
            draggingDonIds={interactive ? drag?.draggingDonIds : undefined}
            selectedDonIds={interactive ? drag?.selectedDonIds : undefined}
            onDonDragStart={interactive ? drag?.onDonDragStart : undefined}
            onDonDragEnd={interactive ? drag?.onDonDragEnd : undefined}
            onDonDragCancel={interactive ? drag?.onDonDragCancel : undefined}
            onDonToggleSelect={interactive ? drag?.onDonToggleSelect : undefined}
            onClearDonSelection={interactive ? drag?.onClearDonSelection : undefined}
          />
        </div>

        <div className="zone-trash">
          <ZonePile
            label="Trash"
            count={data.trash.length}
            variant="trash"
            topDefId={trashTop}
            ownerSeat={ownerSeat}
            onOpen={() => setTrashOpen(true)}
          />
        </div>
      </div>

      {trashOpen ? (
        <TrashViewer
          title={trashTitle}
          cards={trashNewestFirst(data.trash)}
          onClose={() => setTrashOpen(false)}
          ownerSeat={ownerSeat}
          viewingSeat={viewingSeat}
        />
      ) : null}
    </section>
  );
}
