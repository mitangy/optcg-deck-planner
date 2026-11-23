import { type CardLayout, type ListDensity } from "../../ui/CardLayout";
import { CardThumb } from "../../ui/CardThumb";
import { AltChip, AltStripRow, altTrayId, useExpandedAlts } from "../../cards/AltTray";
import { GridCard, MobileCard } from "../../ui/PlannerCard";
import { UsedInCell } from "../../ui/UsedInCell";
import { shownProductId } from "../../cards/altArt";
import { GroupBuyLine, GroupBuyMember, money } from "../../api";
import { SortableTh, useColumnSort, type ColumnSort } from "../../ui/columnSort";
import { boughtAlts, boughtChipLabel, isLineExcluded } from "./groupBuyArt";
import { type ReactNode } from "react";
import { GroupBuyDisplayRow, UserGroupHeading, cardShellClass } from "./lineRows";
import { GroupBuyPrices, GroupBuyYours, LineEach, MemberBreakdown, MemberColorRail } from "./memberParts";
import { lineArtUrl } from "./useGroupBuyLines";

/** Colour and copies; money lives in the price lines so no price shows twice. */
const lineMeta = (line: GroupBuyLine, excluded: boolean) =>
  [excluded ? "Excluded" : "", line.color, `${line.total_qty} ${line.total_qty === 1 ? "copy" : "copies"}`]
    .filter(Boolean)
    .join(" · ");

export function GroupBuyLines({
  layout,
  density = "comfortable",
  isNarrow,
  members,
  displayRows,
  tableRows,
  cardsSort,
  onCardsSort,
  renderBuyEditor,
  buyLabel = "Your buy",
  renderAltRow,
  renderStatus,
  altsOf = (line) => line.alt_arts ?? [],
}: {
  layout: CardLayout;
  /** Compact is a smaller row with the alt arts folded behind one chip; it only applies to the List layout. */
  density?: ListDensity;
  isNarrow: boolean;
  members: GroupBuyMember[];
  displayRows: GroupBuyDisplayRow[];
  tableRows: GroupBuyDisplayRow[];
  cardsSort: ColumnSort | null;
  onCardsSort: ReturnType<typeof useColumnSort>["onSort"];
  renderBuyEditor?: (line: GroupBuyLine, excluded: boolean) => ReactNode;
  /** The buy column's name: "Your buy", or the member the host is buying for. */
  buyLabel?: string;
  renderAltRow?: (line: GroupBuyLine) => ReactNode;
  /** Where the card's copies are (arrived, on the way, not ordered), shown once the group buy is ordered. */
  renderStatus?: (line: GroupBuyLine) => ReactNode;
  /** The alt arts a row's chip counts (the read-only view only shows arts somebody wants). */
  altsOf?: (line: GroupBuyLine) => GroupBuyLine["alt_arts"];
}) {
  const compact = layout === "list" && density === "compact";
  const { open: openAlts, toggle: toggleAlts } = useExpandedAlts();
  // A card in a seller order lists the arts bought instead of the picks (#1443).
  const altsFor = (line: GroupBuyLine) => (line.bought_arts?.length ? boughtAlts(line) : altsOf(line));
  const hasAlts = (line: GroupBuyLine) => Boolean(renderAltRow) && altsFor(line).length > 0;
  const altChip = (line: GroupBuyLine) =>
    compact && hasAlts(line) ? (
      <AltChip
        alts={altsFor(line)}
        label={line.bought_arts?.length ? boughtChipLabel(line) : undefined}
        trayKey={line.card_id}
        expanded={openAlts.has(line.card_id)}
        onToggle={toggleAlts}
      />
    ) : null;
  const heading = (row: Extract<GroupBuyDisplayRow, { kind: "header" }>) => (
    <UserGroupHeading userId={row.userId} displayName={row.displayName} members={members} />
  );
  const tcgLink = (line: GroupBuyLine) =>
    line.tcgplayer_url ? (
      <a className="gb-tcg-link" href={line.tcgplayer_url} target="_blank" rel="noreferrer">
        TCGPlayer
      </a>
    ) : null;
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
              className={cardShellClass("need", excluded)}
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
              {renderStatus ? <div className="gb-line-status">{renderStatus(line)}</div> : null}
              {line.my_used_in?.length ? (
                <div className="grid-card-used-in">
                  <UsedInCell decks={line.my_used_in} />
                </div>
              ) : null}
              <div className="grid-card-price">
                <GroupBuyPrices line={line} />
              </div>
              {renderBuyEditor ? (
                <div className="grid-card-owned">
                  <span>{buyLabel}</span>
                  {renderBuyEditor(line, excluded)}
                </div>
              ) : null}
              {tcgLink(line)}
              {renderAltRow && hasAlts(line) ? <div className="grid-card-alts alt-arts-short">{renderAltRow(line)}</div> : null}
            </GridCard>
          );
        })}
      </div>
    );
  }
  if (isNarrow) {
    return (
      <div className={`mobile-card-list mobile-card-list-mounted${compact ? " density-compact" : ""}`}>
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
          const trayOpen = compact ? hasAlts(line) && openAlts.has(line.card_id) : hasAlts(line);
          return (
            <MobileCard
              key={row.key}
              className={cardShellClass("need", excluded)}
              before={<MemberColorRail line={line} members={members} />}
              cardId={line.card_id}
              name={line.name}
              imageSrc={lineArtUrl(line)}
              imageProductId={shownProductId(line)}
              cost={line.cost ?? null}
              rarity={line.rarity}
              meta={<span className="mobile-card-meta-text">{lineMeta(line, excluded)}</span>}
              info={
                <>
                  <div className="group-buy-who-row">
                    <MemberBreakdown line={line} members={members} />
                  </div>
                  {renderStatus ? <div className="gb-line-status">{renderStatus(line)}</div> : null}
                  {line.my_used_in?.length ? <UsedInCell className="mobile-used-in" decks={line.my_used_in} /> : null}
                  <div className="mobile-card-price-row">
                    <GroupBuyPrices line={line} />
                    {tcgLink(line)}
                    {altChip(line)}
                  </div>
                </>
              }
            >
              {renderBuyEditor ? (
                <div className="mobile-card-owned">
                  <span>{buyLabel}</span>
                  {renderBuyEditor(line, excluded)}
                </div>
              ) : null}
              {trayOpen && renderAltRow ? (
                <div id={compact ? altTrayId(line.card_id) : undefined} className="mobile-card-alts alt-arts-short">
                  {renderAltRow(line)}
                </div>
              ) : null}
            </MobileCard>
          );
        })}
      </div>
    );
  }
  const altCol = Boolean(renderAltRow) && !compact;
  const colSpan = 5 + (renderBuyEditor ? 1 : 0) + (altCol ? 1 : 0);
  const th = (label: string, colKey: string, firstDir: "asc" | "desc") => (
    <SortableTh label={label} colKey={colKey} firstDir={firstDir} sort={cardsSort} onSort={onCardsSort} />
  );
  return (
    <div className={`table-wrap desktop-table${compact ? " density-compact" : ""}`}>
      <table className="data-table group-buy-table">
        <thead>
          <tr>
            {th("Card", "card", "asc")}
            {renderBuyEditor ? th(buyLabel, "mine", "desc") : null}
            {th("Copies", "total", "desc")}
            {th("Who", "who", "asc")}
            {th("Each", "market", "desc")}
            {th("Line total", "est", "desc")}
            {altCol ? <th>Alt arts</th> : null}
          </tr>
        </thead>
        {tableRows.map((row) => {
          if (row.kind === "header") {
            return (
              <tbody key={row.key}>
                <tr className="group-buy-user-header-row">
                  <td colSpan={colSpan}>{heading(row)}</td>
                </tr>
              </tbody>
            );
          }
          const line = row.line;
          const excluded = isLineExcluded(line);
          const stripped = compact && hasAlts(line) && openAlts.has(line.card_id);
          return (
            <tbody key={row.key} className="card-rows">
              <tr className={excluded ? "excluded" : undefined}>
                <td className="card-cell">
                  <MemberColorRail line={line} members={members} />
                  <div className="card-cell-inner">
                    <CardThumb src={lineArtUrl(line)} cardId={line.card_id} alt={line.name} productId={shownProductId(line)} />
                    <div className="card-cell-text">
                      <div className="card-id">{line.card_id}</div>
                      <div className="card-cell-name" title={line.name}>
                        {line.name}
                      </div>
                      {!compact && line.my_used_in?.length ? <UsedInCell decks={line.my_used_in} /> : null}
                      {excluded ? <div className="muted">Excluded</div> : null}
                      {renderStatus ? <div className="gb-line-status">{renderStatus(line)}</div> : null}
                      {tcgLink(line)}
                      {altChip(line)}
                    </div>
                  </div>
                </td>
                {renderBuyEditor ? <td>{renderBuyEditor(line, excluded)}</td> : null}
                <td>{line.total_qty}</td>
                <td>
                  <MemberBreakdown line={line} members={members} />
                  {compact && line.my_used_in?.length ? <UsedInCell className="gb-used-in" decks={line.my_used_in} /> : null}
                </td>
                <td>
                  <LineEach line={line} />
                </td>
                <td className="gb-line-total">
                  <span className="gb-price-amount">{money(line.remaining_cost)}</span>
                  <GroupBuyYours line={line} />
                </td>
                {altCol && renderAltRow ? <td className="alt-arts-cell alt-arts-short">{hasAlts(line) ? renderAltRow(line) : null}</td> : null}
              </tr>
              {stripped && renderAltRow ? (
                <AltStripRow colSpan={colSpan} className={excluded ? "excluded" : undefined} id={altTrayId(line.card_id)}>
                  {renderAltRow(line)}
                </AltStripRow>
              ) : null}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
