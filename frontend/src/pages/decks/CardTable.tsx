import { useMemo } from "react";
import { CardView, money } from "../../api";
import { remainingCostForCard } from "../shopping/deckCost";
import { BuySplit, canSplitBuy } from "../shopping/BuySplit";
import { CollectorDeckChip } from "../collection/CollectorLine";
import { type CardLayout } from "../../ui/CardLayout";
import { nameWithBreaks } from "../../ui/cardName";
import { StackedThumb } from "../../ui/CardThumb";
import { isDonCardType } from "../../cards/donCards";
import { GridCard, MobileCard } from "../../ui/PlannerCard";
import { baseTileFor, mainImageUrl, shownProductId } from "../../cards/altArt";
import { AltArtsRow, MarketPrice } from "../../cards/MarketPrice";
import { OwnedCell, StillNeededCell, ownedCellIsTotal, stillNeededText, totalOwned } from "../collection/OwnedCells";
import { SortableTh, costSortValue, sortByColumn, useColumnSort } from "../../ui/columnSort";
import { busyProductFor } from "../../cache/busyKey";
import { OwnedInput } from "../OwnedInputs";
import { COLSORT_DECK_KEY } from "../../storage/keys";

/** "4 go to Luffy first" when earlier leaders use some of the owned copies. */
function OwnedClaimNote({ card }: { card: CardView }) {
  const earlier = card.earlier_leaders_need ?? 0;
  const claimed = Math.min(card.owned, earlier);
  if (claimed <= 0) return null;
  const leaders = (card.earlier_leaders ?? []).join(", ") || "earlier decks";
  const left = card.owned - claimed;
  return (
    <span
      className="owned-claim-note"
      title={`Copies needed is set to Separate per leader: owned copies go to leaders in deck order. ${leaders} need ${earlier} first, leaving ${left} of your ${card.owned} for this deck.`}
    >
      {claimed} go to {leaders} first
    </span>
  );
}

/** Copies drawn as a stack: the deck's count, except DON!! (it runs up to ten identical cards). */
function stackCopies(c: CardView): number | undefined {
  return c.section === "don" || isDonCardType(c.card_type) ? undefined : c.needed;
}

function deckColumnValue(c: CardView, key: string) {
  switch (key) {
    case "card":
      return c.card_id;
    case "owned":
      return totalOwned(c.owned, c.alts_owned);
    case "still":
      return c.still_need;
    case "market":
      return c.market_price;
    case "type":
      return c.card_type;
    case "cost":
      return costSortValue(c.cost);
    default:
      return null;
  }
}

export function CardTable({
  cards,
  onOwnedSaved,
  showAltArts,
  layout = "list",
  editing = false,
  onNeededChange,
  neededBusyId = null,
  onAltOwnedChange,
  altOwnedBusyKey = null,
  onDisplayArtChange,
  onAltBuyChange,
  onCollectorChange,
  collectorBusyKey = null,
}: {
  cards: CardView[];
  onOwnedSaved: () => void;
  showAltArts: boolean;
  layout?: CardLayout;
  editing?: boolean;
  onNeededChange?: (cardId: string, needed: number) => void;
  neededBusyId?: string | null;
  onAltOwnedChange?: (cardId: string, productId: number, qty: number) => void;
  /** `${cardId}:${productId}` while an alt owned save is in flight. */
  altOwnedBusyKey?: string | null;
  /** Owner pages only: pick which art the card shows (0 = base). */
  onDisplayArtChange?: (cardId: string, productId: number) => void;
  /** Owner pages only: saves how many still-needed copies are bought as one alt art (#906). */
  onAltBuyChange?: (cardId: string, productId: number, qty: number) => void;
  /** Owner pages only: want an alt art as a collector copy on top of the deck's copies (#1035). */
  onCollectorChange?: (cardId: string, productId: number, qty: number) => void;
  /** `${cardId}:${productId}` while a collector save is in flight. */
  collectorBusyKey?: string | null;
}) {
  const { sort, onSort } = useColumnSort(COLSORT_DECK_KEY);
  // The still-needed line is the buy-split trigger on cards with alt arts (owner pages only).
  const buySplit = (c: CardView) =>
    onAltBuyChange && canSplitBuy(c) ? (
      <BuySplit
        card={c}
        amount={money(remainingCostForCard(c))}
        prefix="Left "
        onPick={(productId, qty) => onAltBuyChange(c.card_id, productId, qty)}
        busyProductId={busyProductFor(altOwnedBusyKey, c.card_id)}
        plainWhenIdle={false}
        onCollectorPick={onCollectorChange ? (productId, qty) => onCollectorChange(c.card_id, productId, qty) : undefined}
      />
    ) : null;
  const tableCards = useMemo(() => sortByColumn(cards, sort, deckColumnValue), [cards, sort]);
  // With editable alt tiles on screen, the base count is edited under the Base tile.
  const ownedCell = (c: CardView) => (
    <OwnedCell
      isTotal={ownedCellIsTotal(showAltArts, c.alt_arts?.length ?? 0, Boolean(onAltOwnedChange))}
      owned={c.owned}
      altsOwned={c.alts_owned}
      stepper={<OwnedInput cardId={c.card_id} value={c.owned} onSaved={onOwnedSaved} />}
    />
  );
  const altRow = (c: CardView) => (
    <AltArtsRow
      alts={c.alt_arts ?? []}
      cardId={c.card_id}
      editable={Boolean(onAltOwnedChange)}
      base={baseTileFor(c, Boolean(onAltOwnedChange))}
      baseOwnedControl={
        onAltOwnedChange ? (
          <OwnedInput compact name={c.name} cardId={c.card_id} value={c.owned} onSaved={onOwnedSaved} />
        ) : undefined
      }
      onOwnedChange={
        onAltOwnedChange
          ? (productId, qty) => onAltOwnedChange(c.card_id, productId, qty)
          : undefined
      }
      showBuyPicks={Boolean(onAltBuyChange) && c.still_need > 0}
      shownProductId={shownProductId(c)}
      onShow={
        onDisplayArtChange
          ? (productId) => onDisplayArtChange(c.card_id, productId)
          : undefined
      }
      busyProductId={busyProductFor(altOwnedBusyKey, c.card_id)}
      onCollectorChange={
        onCollectorChange ? (productId, qty) => onCollectorChange(c.card_id, productId, qty) : undefined
      }
      collectorBusyProductId={busyProductFor(collectorBusyKey, c.card_id)}
    />
  );
  if (layout === "grid") {
    return (
      <div className="card-grid">
        {cards.map((c) => (
          <GridCard
            key={`${c.section}-${c.card_id}`}
            dataCardId={c.card_id}
            className={c.still_need > 0 ? "need" : "done"}
            cardId={c.card_id}
            name={c.name}
            imageSrc={mainImageUrl(c)}
            imageProductId={shownProductId(c)}
            copies={stackCopies(c)}
            meta={
              <>
                {[stillNeededText(c.still_need, c.needed), c.card_type || ""].filter(Boolean).join(" · ")}
                {c.collector_want ? <CollectorDeckChip count={c.collector_want} /> : null}
                {onAltBuyChange && canSplitBuy(c) ? <span className="buy-split-line">{buySplit(c)}</span> : null}
              </>
            }
          >
              <div className="grid-card-price">
                <MarketPrice price={c.market_price} productId={c.product_id} />
              </div>
              <div className="grid-card-steppers">
              {editing && onNeededChange ? (
                <div className="grid-card-owned">
                  <span>In deck</span>
                  <NeededStepper
                    cardId={c.card_id}
                    value={c.needed}
                    busy={neededBusyId === c.card_id}
                    onChange={onNeededChange}
                  />
                </div>
              ) : null}
              <div className="grid-card-owned">
                <span>Owned</span>
                {ownedCell(c)}
              </div>
              </div>
              <OwnedClaimNote card={c} />
              {c.tcgplayer_url && (
                <a href={c.tcgplayer_url} target="_blank" rel="noreferrer">
                  TCGPlayer
                </a>
              )}
              {showAltArts && (c.alt_arts?.length ?? 0) > 0 && (
                <div className="grid-card-alts">{altRow(c)}</div>
              )}
          </GridCard>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="table-wrap desktop-table">
        <table className="data-table deck-table">
          <thead>
            <tr>
              <SortableTh label="Card" colKey="card" firstDir="asc" sort={sort} onSort={onSort} />
              <SortableTh label="Owned" colKey="owned" firstDir="desc" sort={sort} onSort={onSort} />
              <SortableTh label="Still needed" colKey="still" firstDir="desc" sort={sort} onSort={onSort} />
              <SortableTh label="Market" colKey="market" firstDir="desc" sort={sort} onSort={onSort} />
              <SortableTh label="Type" colKey="type" firstDir="asc" sort={sort} onSort={onSort} className="col-type" />
              <SortableTh label="Cost" colKey="cost" firstDir="asc" sort={sort} onSort={onSort} />
              {showAltArts ? <th>Alt arts</th> : null}
            </tr>
          </thead>
          <tbody>
            {tableCards.map((c) => (
              <tr key={`${c.section}-${c.card_id}`} data-card-id={c.card_id} className={c.still_need > 0 ? "need" : "done"}>
                <td className="card-cell">
                  <div className="card-cell-inner">
                    <StackedThumb copies={stackCopies(c)} src={mainImageUrl(c)} cardId={c.card_id} alt={c.name} productId={shownProductId(c)} />
                    <div>
                      <div className="card-id">{c.card_id}</div>
                      <div>{nameWithBreaks(c.name)}</div>
                      <CollectorDeckChip count={c.collector_want} />
                      {c.tcgplayer_url && (
                        <a href={c.tcgplayer_url} target="_blank" rel="noreferrer">
                          TCGPlayer
                        </a>
                      )}
                    </div>
                  </div>
                </td>
                <td>
                  {ownedCell(c)}
                  <OwnedClaimNote card={c} />
                </td>
                <td className="need-cell">
                  {editing && onNeededChange ? (
                    <>
                      <span className="still-need-num">{c.still_need}</span>
                      <span className="still-need-of">of</span>
                      <NeededStepper
                        cardId={c.card_id}
                        value={c.needed}
                        busy={neededBusyId === c.card_id}
                        onChange={onNeededChange}
                      />
                    </>
                  ) : (
                    <>
                      <StillNeededCell still={c.still_need} need={c.needed} />
                      {onAltBuyChange && canSplitBuy(c) ? <span className="buy-split-line">{buySplit(c)}</span> : null}
                    </>
                  )}
                </td>
                <td>
                  <MarketPrice price={c.market_price} productId={c.product_id} />
                </td>
                <td className="col-type">{c.card_type || "—"}</td>
                <td>{c.cost ?? "—"}</td>
                {showAltArts ? <td className="alt-arts-cell">{altRow(c)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mobile-card-list">
        {cards.map((c) => (
          <MobileCard
            key={`${c.section}-${c.card_id}`}
            dataCardId={c.card_id}
            className={c.still_need > 0 ? "need" : "done"}
            cardId={c.card_id}
            name={c.name}
            imageSrc={mainImageUrl(c)}
            imageProductId={shownProductId(c)}
            copies={stackCopies(c)}
            cost={c.cost}
            rarity={c.rarity}
            meta={
              <>
                {[c.color, stillNeededText(c.still_need, c.needed), c.card_type || ""].filter(Boolean).join(" · ")}
                {c.collector_want ? <CollectorDeckChip count={c.collector_want} /> : null}
                {onAltBuyChange && canSplitBuy(c) ? <span className="buy-split-line">{buySplit(c)}</span> : null}
              </>
            }
            info={
              <>
                <div className="mobile-card-price-row">
                  <div className="mobile-card-price-main">
                    <span className="muted">Market</span>
                    <MarketPrice price={c.market_price} productId={c.product_id} />
                    {c.tcgplayer_url ? (
                      <a href={c.tcgplayer_url} target="_blank" rel="noreferrer">
                        TCGPlayer
                      </a>
                    ) : null}
                  </div>
                  <div className="mobile-card-owned">
                    <span>Owned</span>
                    {ownedCell(c)}
                  </div>
                </div>
                <OwnedClaimNote card={c} />
              </>
            }
          >
            {editing && onNeededChange ? (
              <div className="mobile-card-owned mobile-card-owned-block">
                <span>In deck</span>
                <NeededStepper
                  cardId={c.card_id}
                  value={c.needed}
                  busy={neededBusyId === c.card_id}
                  onChange={onNeededChange}
                />
              </div>
            ) : null}
            {showAltArts && (c.alt_arts?.length ?? 0) > 0 && (
              <div className="mobile-card-alts">{altRow(c)}</div>
            )}
          </MobileCard>
        ))}
      </div>
    </>
  );
}

function NeededStepper({
  cardId,
  value,
  busy,
  onChange,
}: {
  cardId: string;
  value: number;
  busy?: boolean;
  onChange: (cardId: string, needed: number) => void;
}) {
  return (
    <span className="owned-wrap">
      <button
        type="button"
        className="owned-btn"
        aria-label={`Decrease ${cardId} in deck`}
        disabled={busy || value <= 0}
        onClick={() => onChange(cardId, Math.max(0, value - 1))}
      >
        −
      </button>
      <span className="deck-editor-qty" aria-label={`${cardId} copies in deck`}>
        {value}
      </span>
      <button
        type="button"
        className="owned-btn"
        aria-label={`Increase ${cardId} in deck`}
        disabled={busy}
        onClick={() => onChange(cardId, value + 1)}
      >
        +
      </button>
    </span>
  );
}
