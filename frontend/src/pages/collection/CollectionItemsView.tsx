import { type ReactNode, useMemo } from "react";
import { money, OwnedCard } from "../../api";
import { type CardLayout } from "../../ui/CardLayout";
import { CardColorChips } from "../../ui/CollectionToolbar";
import { CardThumb, MobileCardMedia } from "../../ui/CardThumb";
import { mainImageUrl, shownProductId } from "../../cards/altArt";
import { MarketPrice } from "../../cards/MarketPrice";
import { OwnedCell, ownedCellIsTotal } from "./OwnedCells";
import { SortableTh, costSortValue, sortByColumn, useColumnSort } from "../../ui/columnSort";
import { usedInSortValue } from "../shopping/ShoppingItemsView";
import { OwnedInput } from "../OwnedInputs";
import { COLSORT_COLLECTION_KEY } from "../../storage/keys";

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
  onOwnedSaved,
  showAltArts,
  altRow,
}: {
  items: OwnedCard[];
  layout: CardLayout;
  onOwnedSaved: () => void;
  showAltArts: boolean;
  altRow: (item: OwnedCard) => ReactNode;
}) {
  const { sort, onSort } = useColumnSort(COLSORT_COLLECTION_KEY);
  const tableItems = useMemo(() => sortByColumn(items, sort, collectionColumnValue), [items, sort]);
  if (items.length === 0) return null;
  const hasAltRow = (item: OwnedCard) => showAltArts && (item.alt_arts?.length ?? 0) > 0;
  // Collection alt tiles are always editable, so they own the per-art counts (base under the Base tile).
  const ownedCell = (item: OwnedCard) => (
    <OwnedCell
      isTotal={ownedCellIsTotal(showAltArts, item.alt_arts?.length ?? 0, true)}
      owned={item.owned}
      altsOwned={item.alts_owned}
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
          return (
            <article key={item.card_id} className="grid-card-wrap collection-grid-wrap" data-card-id={item.card_id}>
              <div className="grid-card collection-grid-card">
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
                  {hasAltRow(item) && <div className="grid-card-alts">{altRow(item)}</div>}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    );
  }

  return (
    <>
      <div className="table-wrap desktop-table">
        <table className="data-table collection-table">
          <thead>
            <tr>
              <SortableTh label="Card" colKey="card" firstDir="asc" sort={sort} onSort={onSort} />
              <SortableTh label="Owned" colKey="owned" firstDir="desc" sort={sort} onSort={onSort} />
              <SortableTh label="Market" colKey="market" firstDir="desc" sort={sort} onSort={onSort} />
              <SortableTh label="Value" colKey="value" firstDir="desc" sort={sort} onSort={onSort} />
              <SortableTh label="Cost" colKey="cost" firstDir="asc" sort={sort} onSort={onSort} />
              <SortableTh label="Used in" colKey="used" firstDir="asc" sort={sort} onSort={onSort} />
              {showAltArts ? <th>Alt arts</th> : null}
            </tr>
          </thead>
          <tbody>
            {tableItems.map((item) => (
              <tr key={item.card_id} data-card-id={item.card_id}>
                <td className="card-cell">
                  <div className="card-cell-inner">
                    <CardThumb src={mainImageUrl(item)} cardId={item.card_id} alt={item.name} productId={shownProductId(item)} />
                    <div>
                      <div className="card-id">{item.card_id}</div>
                      <div>{item.name}</div>
                      <CardColorChips color={item.color} />
                      {item.tcgplayer_url && (
                        <a href={item.tcgplayer_url} target="_blank" rel="noreferrer">
                          TCGPlayer
                        </a>
                      )}
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
                {showAltArts ? <td className="alt-arts-cell">{altRow(item)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mobile-card-list">
        {items.map((item) => (
          <article key={item.card_id} className="mobile-card" data-card-id={item.card_id}>
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
                  </div>
                  <div className="mobile-card-owned">
                    <span>Owned</span>
                    {ownedCell(item)}
                  </div>
                </div>
              </div>
            </div>
            {hasAltRow(item) && <div className="mobile-card-alts">{altRow(item)}</div>}
            <p className={`used-in mobile-used-in${item.used_in.length ? "" : " muted"}`}>{usedIn(item)}</p>
          </article>
        ))}
      </div>
    </>
  );
}
