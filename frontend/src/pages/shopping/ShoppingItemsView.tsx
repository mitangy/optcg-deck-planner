import { type ReactNode, Fragment, useMemo } from "react";
import { CollectorLine, money, needBreakdownLabel, ShoppingItem } from "../../api";
import { BuySplit } from "./BuySplit";
import { CollectorChip, CollectorRemove, CollectorStepper } from "../collection/CollectorLine";
import {
  canOpenBuyPopover,
  collectorHaveText,
  collectorOnTopOf,
  collectorSelectKey,
  shoppingRowAmount,
  shoppingSortCost,
  visibleCollectorLines,
} from "../collection/collectorLines";
import { type CardLayout } from "../../ui/CardLayout";
import { CardThumb } from "../../ui/CardThumb";
import { GridCard, MobileCard } from "../../ui/PlannerCard";
import { mainImageUrl, shownMarket, shownProductId } from "../../cards/altArt";
import { MarketPrice } from "../../cards/MarketPrice";
import { OwnedCell, StillNeededCell, ownedCellIsTotal, stillNeededText, totalOwned } from "../collection/OwnedCells";
import { SortableTh, costSortValue, sortByColumn, useColumnSort } from "../../ui/columnSort";
import { OwnedInput, WantInput } from "../OwnedInputs";
import { busyProductFor } from "../../cache/busyKey";
import { COLSORT_SHOPPING_KEY } from "../../storage/keys";

function stopCardSelectBubble(e: { stopPropagation(): void }) {
  e.stopPropagation();
}

/** Used-in text on the public list: decks, the leader breakdown, and cards added without a deck. */
export function sharedUsedIn(item: ShoppingItem): string {
  return [
    item.used_in.join(", "),
    needBreakdownLabel(item),
    (item.extra_qty ?? 0) > 0 ? "Added directly" : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Deck names as small chips (one per deck), then an optional note and action. */
function UsedInCell({
  decks,
  note = "",
  action = null,
  className = "",
}: {
  decks: string[];
  note?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`used-in-cell${className ? ` ${className}` : ""}`}>
      {decks.length > 0 && (
        <ul className="used-in-chips" aria-label="Used in decks">
          {decks.map((name) => (
            <li key={name} className="used-in-chip" title={name}>
              {name}
            </li>
          ))}
        </ul>
      )}
      {note && <span className="used-in-note">{note}</span>}
      {action}
    </div>
  );
}

export const usedInSortValue = (decks: string[]) => decks.join(", ");

export function shoppingColumnValue(item: ShoppingItem, key: string) {
  switch (key) {
    case "card":
      return item.card_id;
    case "owned":
      return totalOwned(item.owned, item.alts_owned);
    case "want":
      return item.need;
    case "still":
      return item.still_need;
    case "market":
      return shownMarket(item).price;
    case "remaining":
      return shoppingSortCost(item);
    case "cost":
      return costSortValue(item.cost);
    case "used":
      return usedInSortValue(item.used_in);
    default:
      return null;
  }
}

/** Master Shopping Market cell: the price (and recent sales) of the art the card shows (#928). */
function ShownMarketPrice({ item }: { item: ShoppingItem }) {
  const { price, productId } = shownMarket(item);
  return <MarketPrice price={price} productId={productId} />;
}

/** Collector-copy wiring for Master Shopping (#1031). */
export type CollectorControls = {
  /** Sets a printing's collector want (also used by the popover's art picker). */
  onChange: (cardId: string, productId: number, qty: number) => void;
  /** Removes a line (qty 0) and offers Undo. */
  onRemove: (cardId: string, line: CollectorLine) => void;
  /** `${cardId}:${productId}` while a collector save is in flight. */
  busyKey: string | null;
  /** The "Still need" filter: lines already covered are hidden. */
  onlyNeed: boolean;
};

export function ShoppingItemsView({
  items,
  layout,
  isNarrow,
  selectedCardIds,
  onToggleCard,
  allVisibleSelected,
  onToggleSelectVisible,
  showAltArts,
  altRow,
  onBuyPick,
  buyBusyKey = null,
  usedInNote,
  onOwnedSaved,
  onRemoveExtra,
  removingExtraId,
  collector,
}: {
  items: ShoppingItem[];
  layout: CardLayout;
  isNarrow: boolean;
  selectedCardIds: Set<string>;
  onToggleCard: (cardId: string) => void;
  allVisibleSelected: boolean;
  onToggleSelectVisible: () => void;
  showAltArts: boolean;
  altRow: (item: ShoppingItem) => ReactNode;
  /** Owner pages: saves how many still-needed copies are bought as one alt art (#906). */
  onBuyPick?: (cardId: string, productId: number, qty: number) => void;
  /** `${cardId}:${productId}` while a buy pick is saving. */
  buyBusyKey?: string | null;
  usedInNote: (item: ShoppingItem) => string;
  onOwnedSaved: () => void;
  onRemoveExtra: (cardId: string) => void;
  removingExtraId: string | null;
  /** Owner pages: collector copy lines under their card (#1031). */
  collector?: CollectorControls;
}) {
  const { sort, onSort } = useColumnSort(COLSORT_SHOPPING_KEY);
  const tableItems = useMemo(() => sortByColumn(items, sort, shoppingColumnValue), [items, sort]);
  if (items.length === 0) return null;
  // Master Shopping's alt tiles are always editable, so they own the per-art counts.
  const ownedCell = (item: ShoppingItem) => (
    <OwnedCell
      isTotal={ownedCellIsTotal(showAltArts, item.alt_arts?.length ?? 0, true)}
      owned={item.owned}
      altsOwned={item.alts_owned}
      stepper={<OwnedInput cardId={item.card_id} value={item.owned} onSaved={onOwnedSaved} />}
    />
  );
  const wantCell = (item: ShoppingItem) => <WantInput item={item} onSaved={onOwnedSaved} />;
  const removeExtraButton = (item: ShoppingItem) =>
    (item.extra_qty ?? 0) > 0 ? (
      <button
        type="button"
        className="ghost danger remove-extra"
        aria-label={`Remove ${item.card_id} from added cards`}
        disabled={removingExtraId === item.card_id}
        onClick={(e) => {
          e.stopPropagation();
          onRemoveExtra(item.card_id);
        }}
      >
        Remove
      </button>
    ) : null;

  const linesOf = (item: ShoppingItem) => (collector ? visibleCollectorLines(item, collector.onlyNeed) : []);
  const lineBusy = (item: ShoppingItem, line: CollectorLine) => collector?.busyKey === `${item.card_id}:${line.product_id}`;
  const lineStepper = (item: ShoppingItem, line: CollectorLine) => (
    <CollectorStepper
      line={line}
      busy={lineBusy(item, line)}
      onChange={(qty) => collector?.onChange(item.card_id, line.product_id, qty)}
    />
  );
  const lineRemove = (item: ShoppingItem, line: CollectorLine) => (
    <CollectorRemove
      line={line}
      cardId={item.card_id}
      disabled={lineBusy(item, line)}
      onRemove={() => collector?.onRemove(item.card_id, line)}
    />
  );
  const lineThumb = (item: ShoppingItem, line: CollectorLine) => (
    <CardThumb
      src={line.image_url || undefined}
      cardId={item.card_id}
      alt={`${line.label} collector copy`}
      productId={line.product_id}
    />
  );
  const lineSelectKey = (item: ShoppingItem, line: CollectorLine) => collectorSelectKey(item.card_id, line.product_id);

  const buySplit = (item: ShoppingItem, prefix = "") => (
    <BuySplit
      card={item}
      amount={money(shoppingRowAmount(item))}
      prefix={prefix}
      onPick={onBuyPick ? (productId, qty) => onBuyPick(item.card_id, productId, qty) : undefined}
      busyProductId={busyProductFor(buyBusyKey, item.card_id)}
      onCollectorPick={collector ? (productId, qty) => collector.onChange(item.card_id, productId, qty) : undefined}
    />
  );

  if (layout === "grid") {
    return (
      <div className="card-grid">
        {items.map((item: ShoppingItem) => {
          const checked = selectedCardIds.has(item.card_id);
          const tapToSelect = isNarrow;
          return (
            <Fragment key={item.card_id}>
            <article
              className={`grid-card-wrap${checked ? " selected-row" : ""}${tapToSelect ? " selectable" : ""}`}
              onClick={tapToSelect ? () => onToggleCard(item.card_id) : undefined}
              onKeyDown={
                tapToSelect
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onToggleCard(item.card_id);
                      }
                    }
                  : undefined
              }
              role={tapToSelect ? "button" : undefined}
              tabIndex={tapToSelect ? 0 : undefined}
              aria-pressed={tapToSelect ? checked : undefined}
            >
              {!tapToSelect && (
                <label className="grid-card-select" onClick={stopCardSelectBubble}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleCard(item.card_id)}
                    aria-label={`Select ${item.card_id}`}
                  />
                </label>
              )}
              <GridCard
                as="div"
                className={item.still_need > 0 ? "need" : "done"}
                cardId={item.card_id}
                name={item.name}
                imageSrc={mainImageUrl(item)}
                imageProductId={shownProductId(item)}
                onMediaClick={stopCardSelectBubble}
                meta={
                  <>
                    {stillNeededText(item.still_need, item.need)}
                    {item.still_need > 0 || canOpenBuyPopover(item, Boolean(collector)) ? (
                      <span className="buy-split-line">{buySplit(item, "Left ")}</span>
                    ) : null}
                  </>
                }
              >
                  {item.used_in.length > 0 && (
                    <div className="grid-card-used-in" onClick={stopCardSelectBubble}>
                      <UsedInCell decks={item.used_in} />
                    </div>
                  )}
                  <div className="grid-card-price" onClick={stopCardSelectBubble}>
                    <ShownMarketPrice item={item} />
                  </div>
                  <div className="grid-card-owned" onClick={stopCardSelectBubble}>
                    <span>Owned</span>
                    {ownedCell(item)}
                  </div>
                  <div className="grid-card-owned grid-card-want" onClick={stopCardSelectBubble}>
                    <span>Want</span>
                    {wantCell(item)}
                  </div>
                  {item.tcgplayer_url && (
                    <a
                      href={item.tcgplayer_url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={stopCardSelectBubble}
                    >
                      TCGPlayer
                    </a>
                  )}
                  {(item.extra_qty ?? 0) > 0 && (
                    <div className="grid-card-extra muted" onClick={stopCardSelectBubble}>
                      <span>Added directly</span>
                      {removeExtraButton(item)}
                    </div>
                  )}
                  {showAltArts && (item.alt_arts?.length ?? 0) > 0 && (
                    <div className="grid-card-alts" onClick={stopCardSelectBubble}>
                      {altRow(item)}
                    </div>
                  )}
              </GridCard>
            </article>
            {linesOf(item).map((line) => {
              const key = lineSelectKey(item, line);
              const lineChecked = selectedCardIds.has(key);
              return (
                <article
                  key={key}
                  className={`grid-card-wrap collector-wrap${lineChecked ? " selected-row" : ""}${tapToSelect ? " selectable" : ""}`}
                  onClick={tapToSelect ? () => onToggleCard(key) : undefined}
                  onKeyDown={
                    tapToSelect
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onToggleCard(key);
                          }
                        }
                      : undefined
                  }
                  role={tapToSelect ? "button" : undefined}
                  tabIndex={tapToSelect ? 0 : undefined}
                  aria-pressed={tapToSelect ? lineChecked : undefined}
                  aria-label={tapToSelect ? `${lineChecked ? "Deselect" : "Select"} ${line.label} collector copy of ${item.card_id}` : undefined}
                >
                  {!tapToSelect && (
                    <label className="grid-card-select" onClick={stopCardSelectBubble}>
                      <input
                        type="checkbox"
                        checked={lineChecked}
                        onChange={() => onToggleCard(key)}
                        aria-label={`Select ${line.label} collector copy of ${item.card_id}`}
                      />
                    </label>
                  )}
                  <GridCard
                    as="div"
                    className={`collector-card ${line.still_need > 0 ? "need" : "done"}`}
                    cardId={item.card_id}
                    name={line.label}
                    imageSrc={line.image_url || undefined}
                    imageProductId={line.product_id}
                    onMediaClick={stopCardSelectBubble}
                    meta={
                      <>
                        <CollectorChip />
                        <span className="collector-have">{collectorHaveText(line)}</span>
                      </>
                    }
                  >
                    <div className="grid-card-price" onClick={stopCardSelectBubble}>
                      <MarketPrice price={line.market_price} productId={line.product_id} />
                    </div>
                    <div className="grid-card-owned grid-card-want" onClick={stopCardSelectBubble}>
                      <span>Want</span>
                      {lineStepper(item, line)}
                    </div>
                    <div className="grid-card-extra collector-grid-foot" onClick={stopCardSelectBubble}>
                      <span className="muted">{collectorOnTopOf(item.used_in)}</span>
                      {lineRemove(item, line)}
                    </div>
                  </GridCard>
                </article>
              );
            })}
            </Fragment>
          );
        })}
      </div>
    );
  }

  return (
    <>
      <div className="table-wrap desktop-table">
        <table className="data-table shopping-table">
          <thead>
            <tr>
              <th className="select-col">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={onToggleSelectVisible}
                  aria-label={allVisibleSelected ? "Deselect visible cards" : "Select visible cards"}
                />
              </th>
              <SortableTh label="Card" colKey="card" firstDir="asc" sort={sort} onSort={onSort} />
              <SortableTh label="Owned" colKey="owned" firstDir="desc" sort={sort} onSort={onSort} />
              <SortableTh label="Want" colKey="want" firstDir="desc" sort={sort} onSort={onSort} />
              <SortableTh label="Still needed" colKey="still" firstDir="desc" sort={sort} onSort={onSort} />
              <SortableTh label="Market" colKey="market" firstDir="desc" sort={sort} onSort={onSort} />
              <SortableTh label="Remaining" colKey="remaining" firstDir="desc" sort={sort} onSort={onSort} />
              <SortableTh label="Cost" colKey="cost" firstDir="asc" sort={sort} onSort={onSort} className="col-cost" />
              <SortableTh label="Used in" colKey="used" firstDir="asc" sort={sort} onSort={onSort} />
              {showAltArts ? <th>Alt arts</th> : null}
            </tr>
          </thead>
          <tbody>
            {tableItems.map((item: ShoppingItem) => {
              const checked = selectedCardIds.has(item.card_id);
              const lines = linesOf(item);
              return (
                <Fragment key={item.card_id}>
                <tr
                  className={`${item.still_need > 0 ? "need" : "done"}${checked ? " selected-row" : ""}${lines.length > 0 ? " has-collector" : ""}`}
                >
                  <td className="select-col">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleCard(item.card_id)}
                      aria-label={`Select ${item.card_id}`}
                    />
                  </td>
                  <td className="card-cell">
                    <div className="card-cell-inner">
                      <CardThumb src={mainImageUrl(item)} cardId={item.card_id} alt={item.name} productId={shownProductId(item)} />
                      <div>
                        <div className="card-id">{item.card_id}</div>
                        <div>{item.name}</div>
                        {item.tcgplayer_url && (
                          <a href={item.tcgplayer_url} target="_blank" rel="noreferrer">
                            TCGPlayer
                          </a>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>{ownedCell(item)}</td>
                  <td className="want-col">{wantCell(item)}</td>
                  <td>
                    <StillNeededCell still={item.still_need} />
                  </td>
                  <td>
                    <ShownMarketPrice item={item} />
                  </td>
                  <td>{buySplit(item)}</td>
                  <td className="col-cost">{item.cost ?? "—"}</td>
                  <td className="used-in">
                    <UsedInCell decks={item.used_in} note={usedInNote(item)} action={removeExtraButton(item)} />
                  </td>
                  {showAltArts ? (
                    <td className="alt-arts-cell" onClick={stopCardSelectBubble}>
                      {altRow(item)}
                    </td>
                  ) : null}
                </tr>
                {lines.map((line, idx) => {
                  const key = lineSelectKey(item, line);
                  const lineChecked = selectedCardIds.has(key);
                  return (
                    <tr
                      key={key}
                      className={`collector-row ${line.still_need > 0 ? "need" : "done"}${lineChecked ? " selected-row" : ""}${idx < lines.length - 1 ? " collector-row-more" : ""}`}
                    >
                      <td className="select-col">
                        <input
                          type="checkbox"
                          checked={lineChecked}
                          onChange={() => onToggleCard(key)}
                          aria-label={`Select ${line.label} collector copy of ${item.card_id}`}
                        />
                      </td>
                      <td className="collector-cell">
                        <span className="collector-elbow" aria-hidden="true" />
                        <div className="collector-cell-inner">
                          <span className="collector-thumb-wrap">{lineThumb(item, line)}</span>
                          <div className="collector-name">
                            <div className="collector-label">{line.label}</div>
                            <CollectorChip />
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="collector-have">{collectorHaveText(line)}</span>
                      </td>
                      <td className="want-col">{lineStepper(item, line)}</td>
                      <td>
                        <StillNeededCell still={line.still_need} />
                      </td>
                      <td>
                        <MarketPrice price={line.market_price} productId={line.product_id} />
                      </td>
                      <td>{line.remaining_cost == null ? "—" : money(line.remaining_cost)}</td>
                      <td className="col-cost" />
                      <td className="used-in">
                        <div className="used-in-cell collector-used-in">
                          <span className="used-in-note">{collectorOnTopOf(item.used_in)}</span>
                          {lineRemove(item, line)}
                        </div>
                      </td>
                      {showAltArts ? <td className="alt-arts-cell" /> : null}
                    </tr>
                  );
                })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mobile-card-list">
        {items.map((item: ShoppingItem) => {
          const checked = selectedCardIds.has(item.card_id);
          return (
            <Fragment key={item.card_id}>
            <MobileCard
              className={`selectable ${item.still_need > 0 ? "need" : "done"}${checked ? " selected-row" : ""}`}
              rootProps={{
                role: "button",
                tabIndex: 0,
                "aria-pressed": checked,
                "aria-label": `${checked ? "Deselect" : "Select"} ${item.card_id}`,
                onClick: () => onToggleCard(item.card_id),
                onKeyDown: (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onToggleCard(item.card_id);
                  }
                },
              }}
              cardId={item.card_id}
              name={item.name}
              imageSrc={mainImageUrl(item)}
              imageProductId={shownProductId(item)}
              cost={item.cost}
              rarity={item.rarity}
              mediaWrapProps={{ onClick: stopCardSelectBubble, onKeyDown: stopCardSelectBubble }}
              meta={
                <>
                  {[item.color, stillNeededText(item.still_need, item.need)]
                    .filter(Boolean)
                    .join(" · ")}
                  {item.still_need > 0 || canOpenBuyPopover(item, Boolean(collector)) ? (
                    <span className="buy-split-line">{buySplit(item, "Left ")}</span>
                  ) : null}
                </>
              }
              info={
                <div
                  className="mobile-card-price-row"
                  onClick={stopCardSelectBubble}
                  onKeyDown={stopCardSelectBubble}
                >
                  <div className="mobile-card-price-main">
                    <span className="muted">Market</span>
                    <ShownMarketPrice item={item} />
                    {item.tcgplayer_url ? (
                      <a
                        href={item.tcgplayer_url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={stopCardSelectBubble}
                      >
                        TCGPlayer
                      </a>
                    ) : null}
                  </div>
                  <div className="mobile-card-owned">
                    <span>Owned</span>
                    {ownedCell(item)}
                  </div>
                  <div className="mobile-card-owned mobile-card-want">
                    <span>Want</span>
                    {wantCell(item)}
                  </div>
                </div>
              }
            >
              {showAltArts && (item.alt_arts?.length ?? 0) > 0 && (
                <div
                  className="mobile-card-alts"
                  onClick={stopCardSelectBubble}
                  onKeyDown={stopCardSelectBubble}
                >
                  {altRow(item)}
                </div>
              )}
              {(item.used_in.length > 0 || (item.extra_qty ?? 0) > 0) && (
                <div onClick={stopCardSelectBubble} onKeyDown={stopCardSelectBubble}>
                  <UsedInCell
                    className="mobile-used-in"
                    decks={item.used_in}
                    note={usedInNote(item)}
                    action={removeExtraButton(item)}
                  />
                </div>
              )}
            </MobileCard>
            {linesOf(item).map((line) => {
              const key = lineSelectKey(item, line);
              const lineChecked = selectedCardIds.has(key);
              return (
                <article
                  key={key}
                  className={`mobile-card collector-card selectable ${line.still_need > 0 ? "need" : "done"}${lineChecked ? " selected-row" : ""}`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={lineChecked}
                  aria-label={`${lineChecked ? "Deselect" : "Select"} ${line.label} collector copy of ${item.card_id}`}
                  onClick={() => onToggleCard(key)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onToggleCard(key);
                    }
                  }}
                >
                  <div className="collector-card-row">
                    <div className="collector-card-main">
                      <span className="collector-thumb-wrap" onClick={stopCardSelectBubble} onKeyDown={stopCardSelectBubble}>
                        {lineThumb(item, line)}
                      </span>
                      <div className="collector-card-text">
                        <div className="collector-label">{line.label}</div>
                        <CollectorChip />
                        <div className="collector-card-sub">{collectorOnTopOf(item.used_in) || "On top of your decks"}</div>
                        <div className="collector-card-sub">
                          {collectorHaveText(line)} · {money(line.market_price)}
                        </div>
                        <div className="collector-card-sub" onClick={stopCardSelectBubble} onKeyDown={stopCardSelectBubble}>
                          {lineRemove(item, line)}
                        </div>
                      </div>
                    </div>
                    <div className="collector-card-step" onClick={stopCardSelectBubble} onKeyDown={stopCardSelectBubble}>
                      {lineStepper(item, line)}
                    </div>
                  </div>
                </article>
              );
            })}
            </Fragment>
          );
        })}
      </div>
    </>
  );
}
