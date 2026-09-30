import { useState, type CSSProperties } from "react";
import { cardBackCssValue } from "../cardBack";
import { lookupCard } from "../cards/atlas";
import type { CardView, Seat } from "../net/protocol";
import { CardTile } from "./CardTile";
import { DonStrip } from "./DonStrip";
import { TrashViewer, trashNewestFirst } from "./TrashViewer";
import { ZonePile, zonePileCountLabel } from "./ZonePile";

type SideData = {
  leader: CardView;
  characters: CardView[];
  stage: CardView | null;
  deckCount: number;
  trash: string[];
  lifeCount: number;
  faceUpLife?: Array<{ index: number; defId: string }>;
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
  /** Custom playmat art (object URL) for this half of the board. */
  matImageUrl?: string | null;
  /** Darkening over custom art, 0–0.8. */
  matDim?: number;
  /** Art opacity, 0.2–1 (1 = solid art). */
  matOpacity?: number;
  /** Turn order tag shown on the mat edge ("1st" / "2nd"). */
  turnOrder?: "first" | "second";
  /** Custom card back (object URL) for face-down cards on this half. */
  cardBackUrl?: string | null;
  /** This half's player is taking the current turn (glow + tag). */
  activeTurn?: boolean;
  /**
   * Opponent half on portrait phones: the four piles collapse into one row of
   * count chips so the characters get the space.
   */
  countRow?: boolean;
};

function CountIcon({ kind }: { kind: "life" | "deck" | "don" | "trash" }) {
  const common = { width: 14, height: 14, viewBox: "0 0 16 16", "aria-hidden": true, className: "count-icon" };
  switch (kind) {
    case "life":
      return (
        <svg {...common}>
          <path d="M8 14 2.2 8.2a3.3 3.3 0 0 1 4.7-4.7L8 4.6l1.1-1.1a3.3 3.3 0 0 1 4.7 4.7z" fill="currentColor" />
        </svg>
      );
    case "deck":
      return (
        <svg {...common}>
          <rect x="4.5" y="1.5" width="8" height="11" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path d="M2.5 4v9.3c0 .7.5 1.2 1.2 1.2H10" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    case "don":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5.6 5.4h2.1c1.6 0 2.7 1 2.7 2.6s-1.1 2.6-2.7 2.6H5.6z" fill="currentColor" />
        </svg>
      );
    case "trash":
      return (
        <svg {...common}>
          <path d="M3 4.5h10M6.2 4.5V3h3.6v1.5M4.2 4.5l.6 8.6h6.4l.6-8.6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      );
  }
}

function CountChip({
  kind,
  text,
  label,
  extra,
  onOpen,
}: {
  kind: "life" | "deck" | "don" | "trash";
  text: string;
  label: string;
  extra?: string;
  onOpen?: () => void;
}) {
  const body = (
    <>
      <CountIcon kind={kind} />
      <span className="count-chip-num">{text}</span>
      {extra ? <span className="count-chip-extra">{extra}</span> : null}
    </>
  );
  return onOpen ? (
    <button type="button" className={`count-chip count-chip-${kind} openable`} aria-label={label} onClick={onOpen}>
      {body}
    </button>
  ) : (
    <div className={`count-chip count-chip-${kind}`} role="group" aria-label={label}>
      {body}
    </div>
  );
}

export function SideField({
  side,
  data,
  compact,
  drag,
  select,
  target,
  ownerSeat,
  viewingSeat,
  matImageUrl,
  matDim = 0.35,
  matOpacity = 1,
  turnOrder,
  cardBackUrl,
  activeTurn = false,
  countRow = false,
}: Props) {
  const mirrored = side === "opp";
  const interactive = side === "you" && drag;
  const [trashOpen, setTrashOpen] = useState(false);
  const [lifeOpen, setLifeOpen] = useState(false);
  const counts = countRow && side === "opp";
  const faceUpLife = data.faceUpLife ?? [];
  const trashTop = data.trash.length ? data.trash[data.trash.length - 1] : null;
  const trashTitle = side === "you" ? "Your trash" : "Opponent trash";
  const leaderLife = lookupCard(data.leader.defId).life;

  const orderTag = turnOrder ? (
    <span
      className={`mat-order mat-order-${turnOrder}`}
      title={turnOrder === "first" ? "Goes first" : "Goes second"}
    >
      {turnOrder === "first" ? "Going 1st" : "Going 2nd"}
    </span>
  ) : null;

  return (
    <section
      className={`side-field side-${side}${mirrored ? " mirrored" : ""}${
        matImageUrl ? " has-mat-art" : ""
      }${activeTurn ? " is-active-turn" : ""}${counts ? " side-counts" : ""}`}
      style={
        matImageUrl || cardBackUrl
          ? ({
              ...(matImageUrl
                ? { "--mat-art": `url("${matImageUrl}")`, "--mat-dim": String(matDim),
                    "--mat-veil": String(Math.max(0, 1 - matOpacity)),
                  }
                : null),
              ...(cardBackUrl ? { "--card-back-art": cardBackCssValue(cardBackUrl) } : null),
            } as CSSProperties)
          : undefined
      }
    >
      {turnOrder && !counts ? orderTag : null}
      <div className="side-grid">
        {counts ? (
          <div className="opp-counts">
            {turnOrder ? orderTag : null}
            <CountChip
              kind="life"
              text={zonePileCountLabel(data.lifeCount, leaderLife ?? undefined)}
              label={`Opponent life: ${data.lifeCount} cards${
                faceUpLife.length ? `, ${faceUpLife.length} face up` : ""
              }`}
              extra={faceUpLife.length ? `${faceUpLife.length}\u2191` : undefined}
              onOpen={faceUpLife.length ? () => setLifeOpen(true) : undefined}
            />
            <CountChip kind="deck" text={String(data.deckCount)} label={`Opponent deck: ${data.deckCount} cards`} />
            <CountChip kind="don" text={String(data.donDeckCount)} label={`Opponent DON!! deck: ${data.donDeckCount} cards`} />
            <CountChip
              kind="trash"
              text={String(data.trash.length)}
              label={`View opponent trash, ${data.trash.length} cards`}
              onOpen={() => setTrashOpen(true)}
            />
          </div>
        ) : null}
        {counts ? null : <div className="zone-life">
          <ZonePile
            label="Life"
            count={data.lifeCount}
            variant="life"
            expectedCount={leaderLife ?? undefined}
          />
          {(data.faceUpLife ?? []).map((card) => (
            <CardTile key={`life-${card.index}-${card.defId}`} defId={card.defId} compact />
          ))}
        </div>}

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
                  instanceId={c.id}
                  compact={compact || mirrored}
                  rested={c.rested}
                  power={c.power}
                  printedPower={c.printedPower}
                  attachedDonCount={c.attachedDonCount}
                  statusLabels={c.statusLabels}
                  selected={isSelected}
                  classNameExtra={extraClass || undefined}
                  inspectGestures
                  onClick={tapHandler}
                  instantClick={isSelectable}
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

        {counts ? null : (
          <div className="zone-deck">
            <ZonePile label="Deck" count={data.deckCount} variant="deck" />
          </div>
        )}

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
                instanceId={leaderId}
                compact={compact || mirrored}
                rested={data.leader.rested}
                power={data.leader.power}
                printedPower={data.leader.printedPower}
                attachedDonCount={data.leader.attachedDonCount}
                statusLabels={data.leader.statusLabels}
                frame="leader"
                selected={isSelected}
                classNameExtra={extraClass || undefined}
                inspectGestures
                onClick={tapHandler}
                instantClick={isSelectable}
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
            (() => {
              const stageId = data.stage!.id;
              const isSelectable = Boolean(select);
              const isTargetable = Boolean(target?.targetableIds.has(stageId));
              const isSelected = isSelectable && select!.selectedId === stageId;
              const isActionable = Boolean(select?.actionableIds?.has(stageId));
              const tapHandler = isSelectable
                ? () => select!.onSelect(stageId)
                : isTargetable
                  ? () => target!.onSelectTarget(stageId)
                  : undefined;
              const extraClass = [
                isTargetable ? "attack-target" : "",
                isActionable && !isSelected ? "has-actions" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <CardTile
                  defId={data.stage!.defId}
                  instanceId={stageId}
                  compact={compact || mirrored}
                  rested={data.stage!.rested}
                  statusLabels={data.stage!.statusLabels}
                  selected={isSelected}
                  classNameExtra={extraClass || undefined}
                  inspectGestures
                  onClick={tapHandler}
                  instantClick={isSelectable}
                  ownerSeat={ownerSeat}
                  viewingSeat={viewingSeat}
                />
              );
            })()
          ) : (
            <div className="zone-slot stage-empty">Stage</div>
          )}
        </div>

        {counts ? null : (
          <div className="zone-don-deck">
            <ZonePile label="DON!! Deck" count={data.donDeckCount} variant="don" />
          </div>
        )}

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

        {counts ? null : (
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
        )}
      </div>

      {lifeOpen ? (
        <TrashViewer
          title="Opponent face-up Life"
          cards={faceUpLife.map((c) => c.defId)}
          note="face up"
          emptyText="No face-up Life cards."
          onClose={() => setLifeOpen(false)}
          ownerSeat={ownerSeat}
          viewingSeat={viewingSeat}
        />
      ) : null}
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
