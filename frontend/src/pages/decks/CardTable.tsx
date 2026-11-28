import { Fragment } from "react";
import { CardView, money } from "../../api";
import { remainingCostForCard } from "../shopping/deckCost";
import { BuySplit, canSplitBuy } from "../shopping/BuySplit";
import { CollectorDeckChip } from "../collection/CollectorLine";
import { type CardLayout, type ListDensity } from "../../ui/CardLayout";
import { nameWithBreaks } from "../../ui/cardName";
import { StackedThumb } from "../../ui/CardThumb";
import { isDonCardType } from "../../cards/donCards";
import { GridCard, MobileCard } from "../../ui/PlannerCard";
import { baseTileFor, mainImageUrl, shownProductId } from "../../cards/altArt";
import { AltArtsRow, MarketPrice } from "../../cards/MarketPrice";
import { AltChip, AltStripRow, CardBodies, altTrayId, useExpandedAlts, useFoldGridAlts, useWideListRows } from "../../cards/AltTray";
import { OwnedCell, RowUndo, StillNeededCell, toBuyText, totalOwned } from "../collection/OwnedCells";
import { SortableTh, costSortValue, useColumnSort } from "../../ui/columnSort";
import { useColumnOrder, useSettledScope } from "../../ui/useSettledOrder";
import { busyProductFor } from "../../cache/busyKey";
import { OwnedInput } from "../OwnedInputs";
import { COLSORT_DECK_KEY } from "../../storage/keys";

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
    case "needed":
      return c.needed;
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

const STRIP_COLS = 5;
const COMPACT_STRIP_COLS = STRIP_COLS + 1;

export function CardTable({
  cards,
  onOwnedSaved,
  showAltArts,
  layout = "list",
  density = "comfortable",
  editing = false,
  onNeededChange,
  neededBusyId = null,
  onAltOwnedChange: onAltOwnedChangeProp,
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
  density?: ListDensity;
  editing?: boolean;
  onNeededChange?: (cardId: string, needed: number) => void;
  neededBusyId?: string | null;
  onAltOwnedChange?: (cardId: string, productId: number, qty: number) => void;
  altOwnedBusyKey?: string | null;
  onDisplayArtChange?: (cardId: string, productId: number) => void;
  onAltBuyChange?: (cardId: string, productId: number, qty: number) => void;
  onCollectorChange?: (cardId: string, productId: number, qty: number) => void;
  collectorBusyKey?: string | null;
}) {
  const { sort, onSort } = useColumnSort(COLSORT_DECK_KEY);
  const scope = useSettledScope();
  // A row you step Owned on keeps its place (and stays, with Undo, when it is covered) until you are done with it (#1498).
  const onAltOwnedChange = onAltOwnedChangeProp
    ? (cardId: string, productId: number, qty: number) => {
        const before = cards.find((c) => c.card_id === cardId)?.alt_arts?.find((a) => a.product_id === productId)?.owned ?? 0;
        scope?.markEdited(cardId, { key: `alt:${productId}`, restore: () => onAltOwnedChangeProp(cardId, productId, before) });
        onAltOwnedChangeProp(cardId, productId, qty);
      }
    : undefined;
  const buySplit = (c: CardView) =>
    onAltBuyChange && canSplitBuy(c) ? (
      <BuySplit
        card={c}
        amount={money(remainingCostForCard(c))}
        prefix="To buy "
        onPick={(productId, qty) => onAltBuyChange(c.card_id, productId, qty)}
        busyProductId={busyProductFor(altOwnedBusyKey, c.card_id)}
        plainWhenIdle={false}
        onCollectorPick={onCollectorChange ? (productId, qty) => onCollectorChange(c.card_id, productId, qty) : undefined}
      />
    ) : null;
  const tableCards = useColumnOrder(cards, sort, deckColumnValue, (c) => c.card_id, scope);
  const wide = useWideListRows();
  const compact = layout === "list" && density === "compact";
  const { open: openAlts, toggle: toggleAlts } = useExpandedAlts();
  const foldGrid = useFoldGridAlts() && layout === "grid";
  const altCol = showAltArts && !wide && !compact;
  const hasAlts = (c: CardView) => showAltArts && (c.alt_arts?.length ?? 0) > 0;
  const altChip = (c: CardView) =>
    (compact || foldGrid) && hasAlts(c) ? (
      <AltChip
        alts={c.alt_arts ?? []}
        trayKey={`${c.section}-${c.card_id}`}
        expanded={openAlts.has(`${c.section}-${c.card_id}`)}
        onToggle={toggleAlts}
      />
    ) : null;
  const ownedCell = (c: CardView) => (
    <OwnedCell
      owned={c.owned}
      altsOwned={c.alts_owned}
      editedInTiles={hasAlts(c) && Boolean(onAltOwnedChange)}
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
            rowId={c.card_id}
            className={c.still_need > 0 ? "need" : "done"}
            cardId={c.card_id}
            name={c.name}
            imageSrc={mainImageUrl(c)}
            imageProductId={shownProductId(c)}
            copies={stackCopies(c)}
            alts={hasAlts(c) && (!foldGrid || openAlts.has(`${c.section}-${c.card_id}`)) ? altRow(c) : undefined}
            altCount={c.alt_arts?.length ?? 0}
            meta={
              <>
                {[toBuyText(c.still_need, c.needed), c.card_type || ""].filter(Boolean).join(" · ")}
                <RowUndo rowId={c.card_id} />
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
              {foldGrid ? <div className="grid-card-alt-chip">{altChip(c)}</div> : null}
          </GridCard>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className={`table-wrap desktop-table${compact ? " density-compact" : ""}`}>
        <table className="data-table deck-table">
          <thead>
            <tr>
              <SortableTh label="Card" colKey="card" firstDir="asc" sort={sort} onSort={onSort} />
              <SortableTh label="Owned" colKey="owned" firstDir="desc" sort={sort} onSort={onSort} />
              {editing && onNeededChange ? (
                <SortableTh label="In deck" colKey="needed" firstDir="desc" sort={sort} onSort={onSort} />
              ) : (
                <SortableTh label="To buy" colKey="still" firstDir="desc" sort={sort} onSort={onSort} className="col-still" />
              )}
              <SortableTh label="Market" colKey="market" firstDir="desc" sort={sort} onSort={onSort} />
              <SortableTh label="Type" colKey="type" firstDir="asc" sort={sort} onSort={onSort} className="col-type" />
              <SortableTh label="Cost" colKey="cost" firstDir="asc" sort={sort} onSort={onSort} />
              {altCol ? <th>Alt arts</th> : null}
            </tr>
          </thead>
          <CardBodies wide={wide || compact}>
            {tableCards.map((c) => {
              const key = `${c.section}-${c.card_id}`;
              const stripped = compact ? hasAlts(c) && openAlts.has(key) : wide && hasAlts(c);
              const rowClass = c.still_need > 0 ? "need" : "done";
              const rows = [
              <tr key="main" data-card-id={c.card_id} data-row-id={c.card_id} className={`${rowClass}${wide ? " alt-main-row" : ""}${stripped && !compact ? " has-strip" : ""}`}>
                <td className="card-cell" rowSpan={stripped && !compact ? 2 : undefined}>
                  <div className="card-cell-inner">
                    <StackedThumb copies={stackCopies(c)} src={mainImageUrl(c)} cardId={c.card_id} alt={c.name} productId={shownProductId(c)} />
                    <div className="card-cell-text">
                      <div className="card-id">{c.card_id}</div>
                      <div className="card-cell-name" title={c.name}>{compact ? c.name : nameWithBreaks(c.name)}</div>
                      <CollectorDeckChip count={c.collector_want} />
                      {c.tcgplayer_url && (
                        <a href={c.tcgplayer_url} target="_blank" rel="noreferrer">
                          TCGPlayer
                        </a>
                      )}
                      {altChip(c)}
                    </div>
                  </div>
                </td>
                <td>
                  {ownedCell(c)}
                  <OwnedClaimNote card={c} />
                </td>
                <td className="need-cell col-still">
                  {editing && onNeededChange ? (
                    <span title={c.still_need > 0 ? `To buy ${c.still_need} of ${c.needed}` : `Have all ${c.needed}`}>
                      <NeededStepper
                        cardId={c.card_id}
                        value={c.needed}
                        busy={neededBusyId === c.card_id}
                        onChange={onNeededChange}
                      />
                    </span>
                  ) : (
                    <>
                      <StillNeededCell still={c.still_need} need={c.needed} rowId={c.card_id} />
                      {onAltBuyChange && canSplitBuy(c) ? <span className="buy-split-line">{buySplit(c)}</span> : null}
                    </>
                  )}
                </td>
                <td>
                  <MarketPrice price={c.market_price} productId={c.product_id} />
                </td>
                <td className="col-type">{c.card_type || "—"}</td>
                <td>{c.cost ?? "—"}</td>
                {altCol ? <td className="alt-arts-cell">{altRow(c)}</td> : null}
              </tr>,
              ];
              if (stripped) {
                rows.push(
                  <AltStripRow key="strip" rowId={c.card_id} colSpan={compact ? COMPACT_STRIP_COLS : STRIP_COLS} className={rowClass} id={compact ? altTrayId(key) : undefined}>
                    {altRow(c)}
                  </AltStripRow>,
                );
              }
              return wide || compact ? (
                <tbody key={key} className="card-rows">
                  {rows}
                </tbody>
              ) : (
                <Fragment key={key}>{rows[0]}</Fragment>
              );
            })}
          </CardBodies>
        </table>
      </div>

      <div className={`mobile-card-list${compact ? " density-compact" : ""}`}>
        {cards.map((c) => (
          <MobileCard
            key={`${c.section}-${c.card_id}`}
            dataCardId={c.card_id}
            rowId={c.card_id}
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
                <span className="mobile-card-meta-text">
                  {[c.color, toBuyText(c.still_need, c.needed), c.card_type || ""].filter(Boolean).join(" · ")}
                </span>
                <RowUndo rowId={c.card_id} />
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
                    {altChip(c)}
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
            {hasAlts(c) && (!compact || openAlts.has(`${c.section}-${c.card_id}`)) && (
              <div id={compact ? altTrayId(`${c.section}-${c.card_id}`) : undefined} className="mobile-card-alts">
                {altRow(c)}
              </div>
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
