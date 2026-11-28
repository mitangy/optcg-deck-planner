import { type ReactNode, Fragment } from "react";
import { money, OwnedCard } from "../../api";
import { type CardLayout, type ListDensity } from "../../ui/CardLayout";
import { CardColorChips } from "../../ui/CollectionToolbar";
import { CardThumb, MobileCardMedia } from "../../ui/CardThumb";
import { mainImageUrl, shownProductId } from "../../cards/altArt";
import { MarketPrice } from "../../cards/MarketPrice";
import { AltChip, AltStripRow, AltTrayContext, CardBodies, altTrayId, useExpandedAlts, useFoldGridAlts, useWideListRows, wideGridAlts } from "../../cards/AltTray";
import { OwnedCell } from "./OwnedCells";
import { SortableTh, costSortValue, useColumnSort } from "../../ui/columnSort";
import { useColumnOrder, useSettledScope } from "../../ui/useSettledOrder";
import { usedInSortValue } from "../shopping/ShoppingItemsView";
import { OwnedInput } from "../OwnedInputs";
import { COLSORT_COLLECTION_KEY } from "../../storage/keys";

const STRIP_COLS = 5;
/** Compact strips span the card column too. */
const COMPACT_STRIP_COLS = STRIP_COLS + 1;

function collectionColumnValue(item: OwnedCard, key: string) {
  switch (key) {
    case "card":
      return item.card_id;
    case "owned":
      return item.owned;
    case "market":
      return item.market_price;
    case "value":
      return item.value;
    case "cost":
      return costSortValue(item.cost);
    case "used":
      return usedInSortValue(item.used_in);
    default:
      return null;
  }
}

export function CollectionItemsView({
  items,
  layout,
  density = "comfortable",
  onOwnedSaved,
  showAltArts,
  altRow,
}: {
  items: OwnedCard[];
  layout: CardLayout;
  density?: ListDensity;
  onOwnedSaved: () => void;
  showAltArts: boolean;
  altRow: (item: OwnedCard) => ReactNode;
}) {
  const { sort, onSort } = useColumnSort(COLSORT_COLLECTION_KEY);
  const tableItems = useColumnOrder(items, sort, collectionColumnValue, (i) => i.card_id, useSettledScope());
  const wide = useWideListRows();
  const compact = layout === "list" && density === "compact";
  const { open: openAlts, toggle: toggleAlts } = useExpandedAlts();
  const foldGrid = useFoldGridAlts() && layout === "grid";
  const altCol = showAltArts && !wide && !compact;
  if (items.length === 0) return null;
  const hasAltRow = (item: OwnedCard) => showAltArts && (item.alt_arts?.length ?? 0) > 0;
  const altChip = (item: OwnedCard) =>
    (compact || foldGrid) && hasAltRow(item) ? (
      <AltChip alts={item.alt_arts ?? []} trayKey={item.card_id} expanded={openAlts.has(item.card_id)} onToggle={toggleAlts} />
    ) : null;
  const ownedCell = (item: OwnedCard) => (
    <OwnedCell
      owned={item.owned}
      altsOwned={item.alts_owned}
      editedInTiles={hasAltRow(item)}
      stepper={<OwnedInput cardId={item.card_id} value={item.owned} onSaved={onOwnedSaved} />}
    />
  );
  const usedIn = (item: OwnedCard) =>
    [item.used_in.length ? item.used_in.join(", ") : "Not in a deck", item.buying ? `Buying ${item.buying}` : ""]
      .filter(Boolean)
      .join(" · ");

  if (layout === "grid") {
    return (
      <div className="card-grid collection-grid">
        {items.map((item) => {
          const copies = item.owned + (item.alts_owned ?? 0);
          const wideAlts = wideGridAlts(wide, item.alt_arts?.length ?? 0, showAltArts);
          const altsBox =
            hasAltRow(item) && (!foldGrid || openAlts.has(item.card_id)) ? (
              <div id={foldGrid ? altTrayId(item.card_id) : undefined} className="grid-card-alts">
                {altRow(item)}
              </div>
            ) : null;
          return (
            <article key={item.card_id} className="grid-card-wrap collection-grid-wrap" data-card-id={item.card_id} data-row-id={item.card_id}>
              <div className={`grid-card collection-grid-card${wideAlts.className}`}>
                <div className="collection-tile-art">
                  <CardThumb src={mainImageUrl(item)} cardId={item.card_id} alt={item.name} productId={shownProductId(item)} />
                  <span className="copies-badge" role="img" aria-label={`${copies} owned`} title={`${copies} owned`}>
                    ×{copies}
                  </span>
                </div>
                <div className="grid-card-body">
                  <div className="grid-card-name" title={item.name}>
                    {item.name}
                  </div>
                  <div className="collection-tile-row">
                    <span className="card-id">{item.card_id}</span>
                    <MarketPrice price={item.market_price} productId={item.product_id} />
                  </div>
                  <CardColorChips color={item.color} />
                  <div className="grid-card-meta muted">
                    Value <strong className="collection-value">{money(item.value)}</strong>
                    {item.buying ? ` · Buying ${item.buying}` : ""}
                  </div>
                  <div className="grid-card-owned">
                    <span>Owned</span>
                    {ownedCell(item)}
                  </div>
                  {item.tcgplayer_url && (
                    <a href={item.tcgplayer_url} target="_blank" rel="noreferrer">
                      TCGPlayer
                    </a>
                  )}
                  {foldGrid ? <div className="grid-card-alt-chip">{altChip(item)}</div> : null}
                  {wideAlts.wide ? null : altsBox}
                </div>
                {wideAlts.wide ? <AltTrayContext.Provider value={true}>{altsBox}</AltTrayContext.Provider> : null}
              </div>
            </article>
          );
        })}
      </div>
    );
  }

  return (
    <>
      <div className={`table-wrap desktop-table${compact ? " density-compact" : ""}`}>
        <table className="data-table collection-table">
          <thead>
            <tr>
              <SortableTh label="Card" colKey="card" firstDir="asc" sort={sort} onSort={onSort} />
              <SortableTh label="Owned" colKey="owned" firstDir="desc" sort={sort} onSort={onSort} />
              <SortableTh label="Market" colKey="market" firstDir="desc" sort={sort} onSort={onSort} />
              <SortableTh label="Value" colKey="value" firstDir="desc" sort={sort} onSort={onSort} />
              <SortableTh label="Cost" colKey="cost" firstDir="asc" sort={sort} onSort={onSort} />
              <SortableTh label="Used in" colKey="used" firstDir="asc" sort={sort} onSort={onSort} />
              {altCol ? <th>Alt arts</th> : null}
            </tr>
          </thead>
          <CardBodies wide={wide || compact}>
            {tableItems.map((item) => {
              const stripped = compact ? hasAltRow(item) && openAlts.has(item.card_id) : wide && hasAltRow(item);
              const rows = [
              <tr key="main" data-card-id={item.card_id} data-row-id={item.card_id} className={wide ? `alt-main-row${stripped && !compact ? " has-strip" : ""}` : undefined}>
                <td className="card-cell" rowSpan={stripped && !compact ? 2 : undefined}>
                  <div className="card-cell-inner">
                    <CardThumb src={mainImageUrl(item)} cardId={item.card_id} alt={item.name} productId={shownProductId(item)} />
                    <div className="card-cell-text">
                      <div className="card-id">{item.card_id}</div>
                      <div className="card-cell-name" title={item.name}>{item.name}</div>
                      <CardColorChips color={item.color} />
                      {item.tcgplayer_url && (
                        <a href={item.tcgplayer_url} target="_blank" rel="noreferrer">
                          TCGPlayer
                        </a>
                      )}
                      {altChip(item)}
                    </div>
                  </div>
                </td>
                <td>{ownedCell(item)}</td>
                <td>
                  <MarketPrice price={item.market_price} productId={item.product_id} />
                </td>
                <td className="collection-value">{money(item.value)}</td>
                <td>{item.cost ?? "—"}</td>
                <td className={`used-in${item.used_in.length ? "" : " muted"}`}>{usedIn(item)}</td>
                {altCol ? <td className="alt-arts-cell">{altRow(item)}</td> : null}
              </tr>,
              ];
              if (stripped) rows.push(<AltStripRow key="strip" rowId={item.card_id} colSpan={compact ? COMPACT_STRIP_COLS : STRIP_COLS} id={compact ? altTrayId(item.card_id) : undefined}>{altRow(item)}</AltStripRow>);
              return wide || compact ? (
                <tbody key={item.card_id} className="card-rows">
                  {rows}
                </tbody>
              ) : (
                <Fragment key={item.card_id}>{rows[0]}</Fragment>
              );
            })}
          </CardBodies>
        </table>
      </div>

      <div className={`mobile-card-list${compact ? " density-compact" : ""}`}>
        {items.map((item) => (
          <article key={item.card_id} className="mobile-card" data-card-id={item.card_id} data-row-id={item.card_id}>
            <div className="mobile-card-top">
              <MobileCardMedia
                src={mainImageUrl(item)}
                productId={shownProductId(item)}
                cardId={item.card_id}
                alt={item.name}
                cost={item.cost}
                rarity={item.rarity}
              />
              <div className="mobile-card-info">
                <div className="card-id">{item.card_id}</div>
                <div className="mobile-card-name">{item.name}</div>
                <div className="mobile-card-meta">
                  {[item.color, `Value ${money(item.value)}`].filter(Boolean).join(" · ")}
                </div>
                <div className="mobile-card-price-row">
                  <div className="mobile-card-price-main">
                    <span className="muted">Market</span>
                    <MarketPrice price={item.market_price} productId={item.product_id} />
                    {item.tcgplayer_url ? (
                      <a href={item.tcgplayer_url} target="_blank" rel="noreferrer">
                        TCGPlayer
                      </a>
                    ) : null}
                    {altChip(item)}
                  </div>
                  <div className="mobile-card-owned">
                    <span>Owned</span>
                    {ownedCell(item)}
                  </div>
                </div>
              </div>
            </div>
            {hasAltRow(item) && (!compact || openAlts.has(item.card_id)) && (
              <div id={compact ? altTrayId(item.card_id) : undefined} className="mobile-card-alts">
                {altRow(item)}
              </div>
            )}
            <p className={`used-in mobile-used-in${item.used_in.length ? "" : " muted"}`}>{usedIn(item)}</p>
          </article>
        ))}
      </div>
    </>
  );
}
