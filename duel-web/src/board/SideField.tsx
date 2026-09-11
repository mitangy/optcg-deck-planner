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
  draggingDonId?: string | null;
  onDonDragStart?: (donId: string) => void;
  onDonDragEnd?: (donId: string, clientX: number, clientY: number) => void;
  onDonDragCancel?: () => void;
  /** Instance ids highlighted as give_don drop targets. */
  giveDonHighlightIds?: ReadonlySet<string>;
  /** Character ids highlighted for play_card trash. */
  playTrashHighlightIds?: ReadonlySet<string>;
  /** Highlight stage + character zones for play_card field drop. */
  playFieldHighlight?: boolean;
};

type Props = {
  side: "you" | "opp";
  data: SideData;
  compact?: boolean;
  drag?: DragHandlers;
  /** Seat that owns cards on this half of the board. */
  ownerSeat?: Seat;
  /** Seat controlling the UI (alt-art picker). */
  viewingSeat?: Seat;
};

export function SideField({ side, data, compact, drag, ownerSeat, viewingSeat }: Props) {
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
            {data.characters.length === 0 ? (
              <div className="zone-slot empty">—</div>
            ) : (
              data.characters.map((c) => {
                const giveHl = Boolean(interactive && drag?.giveDonHighlightIds?.has(c.id));
                const trashHl = Boolean(interactive && drag?.playTrashHighlightIds?.has(c.id));
                let dropAttr: string | null = null;
                if (interactive) {
                  if (drag?.giveDonHighlightIds?.has(c.id)) dropAttr = `give_don:${c.id}`;
                  else if (drag?.playTrashHighlightIds?.has(c.id)) {
                    dropAttr = `play_trash:${c.id}`;
                  }
                }
                return (
                  <CardTile
                    key={c.id}
                    defId={c.defId}
                    compact={compact || mirrored}
                    rested={c.rested}
                    power={c.power}
                    attachedDonCount={c.attachedDonCount}
                    inspectOnClick
                    dropAttr={dropAttr}
                    dropHighlight={giveHl || trashHl}
                    ownerSeat={ownerSeat}
                    viewingSeat={viewingSeat}
                  />
                );
              })
            )}
            {Array.from({ length: Math.max(0, 5 - data.characters.length) }).map((_, i) => (
              <div key={`slot-${i}`} className="zone-slot" aria-hidden />
            ))}
          </div>
        </div>

        <div className="zone-deck">
          <ZonePile label="Deck" count={data.deckCount} variant="deck" />
        </div>

        <div className="zone-leader">
          <div className="zone-caption">Leader</div>
          <CardTile
            defId={data.leader.defId}
            compact={compact || mirrored}
            rested={data.leader.rested}
            power={data.leader.power}
            attachedDonCount={data.leader.attachedDonCount}
            frame="leader"
            inspectOnClick
            dropAttr={
              interactive && drag?.giveDonHighlightIds?.has(data.leader.id)
                ? `give_don:${data.leader.id}`
                : null
            }
            dropHighlight={Boolean(
              interactive && drag?.giveDonHighlightIds?.has(data.leader.id),
            )}
            ownerSeat={ownerSeat}
            viewingSeat={viewingSeat}
          />
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
            draggingDonId={interactive ? drag?.draggingDonId : undefined}
            onDonDragStart={interactive ? drag?.onDonDragStart : undefined}
            onDonDragEnd={interactive ? drag?.onDonDragEnd : undefined}
            onDonDragCancel={interactive ? drag?.onDonDragCancel : undefined}
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
