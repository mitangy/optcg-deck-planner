import { type CardLayout } from "../../ui/CardLayout";
import { CardThumb } from "../../ui/CardThumb";
import { MarketPrice } from "../../cards/MarketPrice";
import { GridCard, MobileCard } from "../../ui/PlannerCard";
import { UsedInCell } from "../../ui/UsedInCell";
import { shownProductId } from "../../cards/altArt";
import { GroupBuyLine, GroupBuyMember, money } from "../../api";
import { SortableTh, useColumnSort, type ColumnSort } from "../../ui/columnSort";
import { isLineExcluded } from "./groupBuyArt";
import { type ReactNode } from "react";
import { GroupBuyDisplayRow, UserGroupHeading, cardShellClass } from "./lineRows";
import { memberColorIndex } from "./memberColors";
import { GroupBuyCardPrice, MemberBreakdown, MemberColorRail } from "./memberParts";
import { lineArtUrl } from "./useGroupBuyLines";

const lineMeta = (line: GroupBuyLine, excluded: boolean) =>
  [excluded ? "Excluded" : "", line.color, `Total ${line.total_qty}`, money(line.remaining_cost)]
    .filter(Boolean)
    .join(" · ");

/**
 * The merged card list as grid cards, phone cards or desktop table rows. The member page
 * and the view-only invite page both render it, so the art (`lineArtUrl`), meta, who chips
 * and price can't drift apart again (#887). The member-only parts are slots: leave them out
 * for the view-only page and the matching column / row disappears.
 */
export function GroupBuyLines({
  layout,
  isNarrow,
  members,
  displayRows,
  tableRows,
  cardsSort,
  onCardsSort,
  renderBuyEditor,
  renderAltRow,
}: {
  layout: CardLayout;
  isNarrow: boolean;
  members: GroupBuyMember[];
  displayRows: GroupBuyDisplayRow[];
  tableRows: GroupBuyDisplayRow[];
  cardsSort: ColumnSort | null;
  onCardsSort: ReturnType<typeof useColumnSort>["onSort"];
  /** "Your buy" stepper (member page while the group buy is open). */
  renderBuyEditor?: (line: GroupBuyLine, excluded: boolean) => ReactNode;
  /** Alt arts row (member page with Show alt arts on). */
  renderAltRow?: (line: GroupBuyLine) => ReactNode;
}) {
  const heading = (row: Extract<GroupBuyDisplayRow, { kind: "header" }>) => (
    <UserGroupHeading userId={row.userId} displayName={row.displayName} members={members} />
  );
  if (layout === "grid") {
    return (
      <div className="card-grid">
        {displayRows.map((row) => {
          if (row.kind === "header") {
            return (
              <div key={row.key} className="group-buy-user-section">
                {heading(row)}
              </div>
            );
          }
          const line = row.line;
          const excluded = isLineExcluded(line);
          return (
            <GridCard
              key={row.key}
              className={cardShellClass("need", line, members, excluded)}
              before={<MemberColorRail line={line} members={members} />}
              cardId={line.card_id}
              name={line.name}
              imageSrc={lineArtUrl(line)}
              imageProductId={shownProductId(line)}
              meta={lineMeta(line, excluded)}
            >
              <div className="group-buy-who-row">
                <MemberBreakdown line={line} members={members} />
              </div>
              {line.my_used_in?.length ? (
                <div className="grid-card-used-in">
                  <UsedInCell decks={line.my_used_in} />
                </div>
              ) : null}
              <div className="grid-card-price">
                <GroupBuyCardPrice line={line} />
              </div>
              {renderBuyEditor ? (
                <div className="grid-card-owned">
                  <span>Your buy</span>
                  {renderBuyEditor(line, excluded)}
                </div>
              ) : null}
              {line.tcgplayer_url ? (
                <a href={line.tcgplayer_url} target="_blank" rel="noreferrer">
                  TCGPlayer
                </a>
              ) : null}
              {renderAltRow ? <div className="grid-card-alts alt-arts-short">{renderAltRow(line)}</div> : null}
            </GridCard>
          );
        })}
      </div>
    );
  }
  if (isNarrow) {
    return (
      <div className="mobile-card-list mobile-card-list-mounted">
        {displayRows.map((row) => {
          if (row.kind === "header") {
            return (
              <div key={row.key} className="group-buy-user-section">
                {heading(row)}
              </div>
            );
          }
          const line = row.line;
          const excluded = isLineExcluded(line);
          return (
            <MobileCard
              key={row.key}
              className={cardShellClass("need", line, members, excluded)}
              before={<MemberColorRail line={line} members={members} />}
              cardId={line.card_id}
              name={line.name}
              imageSrc={lineArtUrl(line)}
              imageProductId={shownProductId(line)}
              cost={line.cost ?? null}
              rarity={line.rarity}
              meta={lineMeta(line, excluded)}
              info={
                <>
                  <div className="group-buy-who-row">
                    <MemberBreakdown line={line} members={members} />
                  </div>
                  {line.my_used_in?.length ? <UsedInCell className="mobile-used-in" decks={line.my_used_in} /> : null}
                  <div className="mobile-card-price-row">
                    <GroupBuyCardPrice line={line} />
                    {line.tcgplayer_url ? (
                      <a href={line.tcgplayer_url} target="_blank" rel="noreferrer">
                        TCGPlayer
                      </a>
                    ) : null}
                  </div>
                </>
              }
            >
              {renderBuyEditor ? (
                <div className="mobile-card-owned">
                  <span>Your buy</span>
                  {renderBuyEditor(line, excluded)}
                </div>
              ) : null}
              {renderAltRow ? <div className="mobile-card-alts alt-arts-short">{renderAltRow(line)}</div> : null}
            </MobileCard>
          );
        })}
      </div>
    );
  }
  const colSpan = 5 + (renderBuyEditor ? 1 : 0) + (renderAltRow ? 1 : 0);
  const th = (label: string, colKey: string, firstDir: "asc" | "desc") => (
    <SortableTh label={label} colKey={colKey} firstDir={firstDir} sort={cardsSort} onSort={onCardsSort} />
  );
  return (
    <div className="table-wrap desktop-table">
      <table className="data-table">
        <thead>
          <tr>
            {th("Card", "card", "asc")}
            {renderBuyEditor ? th("Your buy", "mine", "desc") : null}
            {th("Total", "total", "desc")}
            {th("Who", "who", "asc")}
            {th("Market", "market", "desc")}
            {th("Est.", "est", "desc")}
            {renderAltRow ? <th>Alt arts</th> : null}
          </tr>
        </thead>
        <tbody>
          {tableRows.map((row) => {
            if (row.kind === "header") {
              return (
                <tr key={row.key} className="group-buy-user-header-row">
                  <td colSpan={colSpan}>{heading(row)}</td>
                </tr>
              );
            }
            const line = row.line;
            const excluded = isLineExcluded(line);
            const active = line.members.filter((m) => m.qty > 0);
            const soleClass =
              active.length === 1 ? ` gb-user-${memberColorIndex(active[0].user_id, members)}` : "";
            return (
              <tr key={row.key} className={`${excluded ? "excluded" : ""}${soleClass}`.trim() || undefined}>
                <td className="card-cell">
                  <MemberColorRail line={line} members={members} />
                  <div className="card-cell-inner">
                    <CardThumb src={lineArtUrl(line)} cardId={line.card_id} alt={line.name} productId={shownProductId(line)} />
                    <div>
                      <div className="card-id">{line.card_id}</div>
                      <div>{line.name}</div>
                      {line.my_used_in?.length ? <UsedInCell decks={line.my_used_in} /> : null}
                      {excluded ? <div className="muted">Excluded</div> : null}
                      {line.tcgplayer_url ? (
                        <a href={line.tcgplayer_url} target="_blank" rel="noreferrer">
                          TCGPlayer
                        </a>
                      ) : null}
                    </div>
                  </div>
                </td>
                {renderBuyEditor ? <td>{renderBuyEditor(line, excluded)}</td> : null}
                <td>{line.total_qty}</td>
                <td>
                  <MemberBreakdown line={line} members={members} />
                </td>
                <td>
                  <MarketPrice price={line.market_price} productId={line.product_id} />
                </td>
                <td>{money(line.remaining_cost)}</td>
                {renderAltRow ? <td className="alt-arts-cell alt-arts-short">{renderAltRow(line)}</td> : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
