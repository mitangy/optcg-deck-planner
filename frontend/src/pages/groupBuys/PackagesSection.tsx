import { Menu, MenuButton, MenuItem, MenuList } from "@optcg/ui/popups";
import { copyText } from "@optcg/ui/clipboard";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { GroupBuyDetail, GroupBuyLine, GroupBuyOrder, GroupBuyOrderLine } from "../../api";
import { CardThumb } from "../../ui/CardThumb";
import { ChoiceSortMenu, usePersistedChoice } from "../../ui/cardListControls";
import { MoreIcon } from "../../ui/HeadPopover";
import { ListToolbar } from "../../ui/ListToolbar";
import { GB_PACKAGE_SORT_KEY } from "../../storage/keys";
import { goToNotInOrder } from "./NotInOrderPanel";
import {
  PACKAGE_SORTS,
  PACKAGE_SORT_LABELS,
  PACKAGE_TOOLBAR_MIN,
  arrivedDay,
  countsTotal,
  emptyPillFallback,
  hitsFirst,
  keepPlace,
  notOrderedMatches,
  orderChip,
  orderLineArt,
  orderTail,
  orderTitle,
  packageCounts,
  packageFilterWord,
  packageHit,
  packagePills,
  packageStatus,
  packageView,
  progressLabels,
  sellerName,
  thumbSplit,
  type ChipTone,
  type PackageCounts,
  type PackageFilter,
  type PackageHit,
  type PackageSort,
} from "./groupBuyOrders";

/** How wide the thumbnail row is, so the card shows only the thumbnails that fit and a +N chip for the rest. */
function useRowWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(0, el.clientWidth - 8));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

export function StatusChip({ label, tone }: { label: string; tone: ChipTone }) {
  const mark =
    tone === "done"
      ? "✓ "
      : tone === "way"
        ? "→ "
        : tone === "none"
          ? "○ "
          : "! ";
  return (
    <span className={`gb-chip gb-chip-${tone}`}>
      <span aria-hidden="true">{mark}</span>
      {label}
    </span>
  );
}

/** Three segments (solid, striped, empty) and the same numbers as words, so colour is never the only signal. */
export function ProgressBar({
  counts,
  label,
  notOrderedLink = false,
}: {
  counts: PackageCounts;
  label: string;
  /** Make "N not in an order yet" jump to the list of those cards (#1439). */
  notOrderedLink?: boolean;
}) {
  const total = Math.max(1, countsTotal(counts));
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="gb-progress">
      <div
        className="gb-progress-bar"
        role="img"
        aria-label={`${label}: ${progressLabels(counts).join(", ")}`}
      >
        <span
          className="gb-progress-seg arrived"
          style={{ width: pct(counts.arrived) }}
        />
        <span
          className="gb-progress-seg onway"
          style={{ width: pct(counts.onTheWay) }}
        />
      </div>
      <p className="gb-progress-text">
        {progressLabels(counts).map((t, i) =>
          i === 2 && notOrderedLink && counts.notOrdered > 0 ? (
            <button
              key={t}
              type="button"
              className="gb-link-btn gb-progress-link"
              aria-label={`${t}. Show which cards`}
              data-testid="gb-not-ordered-link"
              onClick={goToNotInOrder}
            >
              {t}
            </button>
          ) : (
            <span key={t} aria-hidden="true">
              {t}
            </span>
          ),
        )}
      </p>
    </div>
  );
}

const COPY_ICON = (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false">
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h8" />
  </svg>
);
const CHECK_ICON = (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true" focusable="false">
    <path d="m5 12.5 4.5 4.5L19 7" />
  </svg>
);

function OrderThumbs({
  order,
  lines,
  hits,
  onMore,
}: {
  order: GroupBuyOrder;
  lines: GroupBuyLine[];
  hits: GroupBuyOrderLine[];
  /** Opens Check items, which lists every card. Absent when this viewer cannot. */
  onMore?: () => void;
}) {
  const { ref, width } = useRowWidth();
  const byCard = new Map(lines.map((l) => [l.card_id, l]));
  if (order.lines.length === 0)
    return <p className="muted gb-order-empty">No cards in this order yet.</p>;
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  // Before the row is measured, show a phone's worth rather than everything.
  const { shown: count, more } = thumbSplit(order.lines.length, width > 0 ? width + 0.4 * rem : 5 * 3.4 * rem, 3.4 * rem);
  const shown = hitsFirst(order.lines, hits).slice(0, count);
  const hitIds = new Set(hits.map((l) => l.id));
  return (
    <div className="gb-order-thumbs" ref={ref}>
      {shown.map((l) => (
        <span
          key={l.id}
          className={`gb-order-thumb${hits.length ? (hitIds.has(l.id) ? " hit" : " dim") : ""}`}
          title={`${l.qty_ordered} × ${l.name || l.card_id}`}
        >
          <CardThumb
            src={orderLineArt(byCard.get(l.card_id), l.product_id)}
            cardId={l.card_id}
            alt={l.name || l.card_id}
            productId={l.product_id ?? undefined}
          />
          <span className="gb-order-thumb-qty">×{l.qty_ordered}</span>
        </span>
      ))}
      {more > 0 ? (
        onMore ? (
          <button type="button" className="gb-order-more" aria-label={`${more} more ${more === 1 ? "card" : "cards"}. Open Check items`} onClick={onMore}>
            +{more}
          </button>
        ) : (
          <span className="gb-order-more" aria-label={`${more} more ${more === 1 ? "card" : "cards"}`}>
            +{more}
          </span>
        )
      ) : null}
    </div>
  );
}

/** "Shanks OP01-120 ×1 · for Nami": which card in this package the search found, and who it is for. */
function MatchLines({ hit }: { hit: PackageHit }) {
  if (hit.lines.length === 0) return null;
  return (
    <p className="gb-order-match" data-testid="gb-order-match">
      {hit.lines.map((l, i) => (
        <span key={l.id} className="gb-order-match-line">
          {i > 0 ? <br /> : null}
          <mark>{l.name || l.card_id}</mark> {l.card_id} ×{l.qty_ordered}
          {l.allocations.length > 0 ? ` · for ${l.allocations.map((a) => a.display_name).join(", ")}` : ""}
        </span>
      ))}
    </p>
  );
}

function OrderCard({
  order,
  index,
  lines,
  hit,
  canEdit,
  busy,
  onMarkArrived,
  onCheck,
  onUndo,
  onDelete,
  onEdit,
}: {
  order: GroupBuyOrder;
  index: number;
  lines: GroupBuyLine[];
  hit: PackageHit;
  canEdit: boolean;
  busy: boolean;
  onMarkArrived: (o: GroupBuyOrder) => void;
  onCheck: (o: GroupBuyOrder) => void;
  onUndo: (o: GroupBuyOrder) => void;
  onDelete: (o: GroupBuyOrder) => void;
  onEdit: (o: GroupBuyOrder) => void;
}) {
  const chip = orderChip(order);
  const status = packageStatus(order);
  const [copied, setCopied] = useState(false);
  const arrivedAny = order.qty_arrived > 0;
  const seller = sellerName(order);
  const manage = canEdit;
  const menuItems = [
    {
      key: "edit",
      label: "Edit order",
      run: () => onEdit(order),
      danger: false,
    },
    !seller
      ? {
          key: "seller",
          label: "Add seller name",
          run: () => onEdit(order),
          danger: false,
        }
      : null,
    arrivedAny
      ? {
          key: "undo",
          label: "Undo arrival",
          run: () => onUndo(order),
          danger: false,
        }
      : null,
    !arrivedAny
      ? {
          key: "delete",
          label: "Delete order",
          run: () => onDelete(order),
          danger: true,
        }
      : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);
  const day = status === "arrived" ? arrivedDay(order.arrived_at) : "";
  const tail = orderTail(order.order_number);
  return (
    <li className={`gb-order${status === "arrived" ? " done" : ""}`} data-testid="gb-order" data-status={order.status}>
      <div className="gb-order-head">
        <h3 className={`gb-order-title${seller ? "" : " unnamed"}`} title={seller ?? undefined}>
          {seller ?? "Seller not set"}
        </h3>
        {order.tracking_url && status !== "arrived" ? (
          <a className="gb-track" href={order.tracking_url} target="_blank" rel="noopener noreferrer" aria-label={`Track package for ${orderTitle(order, index)}`}>
            Track ↗
          </a>
        ) : null}
        {manage && menuItems.length > 0 ? (
          <Menu as="div" className="head-popover gb-more">
            <MenuButton
              type="button"
              className="ghost gb-more-btn"
              aria-label={`More for ${orderTitle(order, index)}`}
              title="More"
            >
              <MoreIcon />
            </MenuButton>
            <MenuList
              anchor={{ to: "bottom end", gap: 6, padding: 8 }}
              className="head-popover-panel head-popover-menu"
              style={{ width: "min(14rem, calc(100vw - 16px))" }}
            >
              {menuItems.map((m) => (
                <MenuItem key={m.key} disabled={busy}>
                  <button
                    type="button"
                    className={m.danger ? "danger" : undefined}
                    onClick={m.run}
                  >
                    {m.label}
                  </button>
                </MenuItem>
              ))}
            </MenuList>
          </Menu>
        ) : null}
      </div>
      <div className="gb-order-meta muted">
        <StatusChip {...chip} />
        <span>
          {day ? `${day} · ` : ""}
          {order.qty_arrived} of {order.qty_ordered} arrived
          {order.qty_extra > 0 ? ` · ${order.qty_extra} extra` : ""}
        </span>
        {tail ? (
          <span className="gb-order-no">
            #…{tail}
            <button
              type="button"
              className="gb-copy-btn"
              aria-label={`Copy order number ${order.order_number}`}
              title="Copy order number"
              onClick={async () => {
                setCopied(await copyText(order.order_number));
                setTimeout(() => setCopied(false), 1600);
              }}
            >
              {copied ? CHECK_ICON : COPY_ICON}
            </button>
            <span className="gb-copied" role="status">
              {copied ? "Copied" : ""}
            </span>
          </span>
        ) : null}
      </div>
      <MatchLines hit={hit} />
      <OrderThumbs order={order} lines={lines} hits={hit.lines} onMore={manage ? () => onCheck(order) : undefined} />
      <div className="gb-order-actions">
        {manage && order.lines.length === 0 ? (
          <button type="button" className="btn primary" disabled={busy} onClick={() => onEdit(order)}>
            Add items
          </button>
        ) : null}
        {manage && order.lines.length > 0 && status === "on_the_way" ? (
          <>
            <button type="button" className="btn primary" disabled={busy} onClick={() => onMarkArrived(order)}>
              Mark arrived
            </button>
            <button type="button" className="btn secondary" disabled={busy} onClick={() => onCheck(order)}>
              Check items
            </button>
          </>
        ) : null}
        {manage && order.lines.length > 0 && status === "partial" ? (
          <button type="button" className="btn primary" disabled={busy} onClick={() => onCheck(order)}>
            Check missing cards
          </button>
        ) : null}
        {manage && order.lines.length > 0 && status === "arrived" ? (
          <button type="button" className="btn quiet" disabled={busy} onClick={() => onCheck(order)}>
            Check items
          </button>
        ) : null}
      </div>
    </li>
  );
}

/** One line per package for members: seller, status and a Track link. No host buttons. */
function MemberOrderRow({ order }: { order: GroupBuyOrder }) {
  const chip = orderChip(order);
  const seller = sellerName(order);
  return (
    <li className="gb-order-row" data-testid="gb-order">
      <span className={`gb-order-row-name${seller ? "" : " unnamed"}`}>{seller ?? "Seller not set"}</span>
      <StatusChip {...chip} />
      {order.tracking_url ? (
        <a
          className="gb-link-btn"
          href={order.tracking_url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Track
        </a>
      ) : null}
    </li>
  );
}

type OrderHandlers = {
  canEdit: boolean;
  busy: boolean;
  onMarkArrived: (o: GroupBuyOrder) => void;
  onCheck: (o: GroupBuyOrder) => void;
  onUndo: (o: GroupBuyOrder) => void;
  onDelete: (o: GroupBuyOrder) => void;
  onEdit: (o: GroupBuyOrder) => void;
};

function PackagesEmpty({
  query,
  matchedCount,
  filter,
  notOrdered,
  showNotOrderedLink,
  onShowAll,
  onClear,
}: {
  query: string;
  matchedCount: number;
  filter: PackageFilter;
  notOrdered: { name: string; copies: number; who: string[] }[];
  showNotOrderedLink: boolean;
  onShowAll: () => void;
  onClear: () => void;
}) {
  const q = query.trim();
  const first = notOrdered[0];
  return (
    <div className="gb-pkg-empty" data-testid="gb-pkg-empty" role="status">
      {q && matchedCount > 0 ? (
        <>
          <strong>
            No {packageFilterWord(filter).toLowerCase()} packages have “{q}”.
          </strong>
          <button type="button" className="gb-link-btn" onClick={onShowAll}>
            Show all {matchedCount}
          </button>
        </>
      ) : q && first ? (
        <>
          <strong>No package has “{q}” yet.</strong>
          <span>
            {first.copies} {first.copies === 1 ? "copy" : "copies"} of {first.name} {first.copies === 1 ? "is" : "are"}{" "}
            {showNotOrderedLink ? (
              <button type="button" className="gb-link-btn" onClick={goToNotInOrder}>
                not in an order yet
              </button>
            ) : (
              "not in an order yet"
            )}
            {first.who.length ? ` (for ${first.who.join(", ")})` : ""}.
          </span>
        </>
      ) : q ? (
        <>
          <strong>No package has “{q}”.</strong>
          <span>Search looks at card names, card numbers, sellers, members and order numbers.</span>
          <button type="button" className="gb-link-btn" onClick={onClear}>
            Clear search
          </button>
        </>
      ) : (
        <>
          <strong>No packages here.</strong>
          <button type="button" className="gb-link-btn" onClick={onShowAll}>
            Show all
          </button>
        </>
      )}
    </div>
  );
}

/** The host's packages: search, status pills and sort once there are enough packages to need them. */
function HostPackages({ detail, ...h }: { detail: GroupBuyDetail } & OrderHandlers) {
  const orders = detail.orders ?? [];
  const showBar = orders.length >= PACKAGE_TOOLBAR_MIN;
  const [query, setQuery] = useState("");
  const [pill, setPill] = useState<PackageFilter>("all");
  const [savedSort, setSort] = usePersistedChoice(GB_PACKAGE_SORT_KEY, "not_arrived", PACKAGE_SORTS);
  const q = showBar ? query.trim() : "";
  const filter: PackageFilter = showBar ? pill : "all";
  const sort: PackageSort = showBar ? (savedSort as PackageSort) : "added";

  const view = packageView(orders, { query: q, filter, sort, withMembers: true });
  // Packages stay where they are while the filter, sort and search stay: marking one arrived must not move it.
  const key = `${filter}|${sort}|${q}`;
  const [held, setHeld] = useState<{ key: string; ids: number[] }>({ key, ids: [] });
  const freshIds = view.list.map((i) => i.order.id);
  const ids = held.key === key ? keepPlace(held.ids, freshIds, new Set(orders.map((o) => o.id))) : freshIds;
  if (held.key !== key || ids.length !== held.ids.length || ids.some((id, i) => id !== held.ids[i])) setHeld({ key, ids });
  const moved = ids.filter((id) => !freshIds.includes(id)).length;

  // A pill with nothing in it (and no search) is a dead end: go back to All.
  const settled = emptyPillFallback(pill, view.counts, q !== "", ids.length);
  useEffect(() => {
    if (showBar && settled !== pill) setPill(settled);
  }, [showBar, settled, pill]);

  const byId = new Map(orders.map((o, i) => [o.id, { order: o, index: i }]));
  const shownItems = ids.flatMap((id) => {
    const it = byId.get(id);
    return it ? [{ ...it, hit: q ? packageHit(it.order, q, true) : { any: true, lines: [] } }] : [];
  });

  const notOrdered = q ? notOrderedMatches(detail.lines, q) : [];
  const notOrderedCopiesFound = notOrdered.reduce((s, m) => s + m.copies, 0);
  const canJump = detail.status === "ordered";
  const note = q && shownItems.length > 0
    ? `${shownItems.length} of ${orders.length} ${orders.length === 1 ? "package has" : "packages have"} “${q}”`
    : "";

  return (
    <>
      {showBar ? (
        <>
          <ListToolbar
            className="gb-pkg-toolbar"
            search={{
              value: query,
              onChange: setQuery,
              placeholder: "Card, seller or order #",
              label: "Search packages",
              title: "Looks at card names and numbers, sellers, order numbers and member names",
              icon: "search",
            }}
            types={{
              types: [],
              options: packagePills(view.counts, pill, q !== "").map((p) => ({ value: p.value, label: p.label, count: p.count })),
              value: pill,
              onChange: (v) => setPill(v as PackageFilter),
              ariaLabel: "Package status",
            }}
            extras={
              <ChoiceSortMenu
                options={PACKAGE_SORTS.map((s) => ({ value: s, label: PACKAGE_SORT_LABELS[s] }))}
                value={sort}
                onChange={setSort}
              />
            }
          />
          <p className="gb-pkg-note muted" role="status" aria-live="polite">
            {note}
            {q && shownItems.length > 0 && notOrderedCopiesFound > 0 ? (
              <>
                {" · "}
                {notOrderedCopiesFound} more {notOrderedCopiesFound === 1 ? "copy is" : "copies are"}{" "}
                {canJump ? (
                  <button type="button" className="gb-link-btn" onClick={goToNotInOrder}>
                    not in an order yet
                  </button>
                ) : (
                  "not in an order yet"
                )}
              </>
            ) : null}
            {moved > 0 ? `${q ? ". " : ""}${moved} ${moved === 1 ? "package changed" : "packages changed"} and stay${moved === 1 ? "s" : ""} here until you change the filter or sort.` : ""}
          </p>
        </>
      ) : null}
      {shownItems.length === 0 ? (
        <PackagesEmpty
          query={q}
          matchedCount={view.counts.all}
          filter={filter}
          notOrdered={notOrdered}
          showNotOrderedLink={canJump}
          onShowAll={() => setPill("all")}
          onClear={() => {
            setQuery("");
            setPill("all");
          }}
        />
      ) : (
        <ul className="gb-order-list">
          {shownItems.map(({ order, index, hit }) => (
            <OrderCard key={order.id} order={order} index={index} lines={detail.lines} hit={hit} {...h} />
          ))}
        </ul>
      )}
    </>
  );
}

export function PackagesSection({
  detail,
  canEdit,
  busy,
  onAddOrder,
  onMarkArrived,
  onCheck,
  onUndo,
  onDelete,
  onEdit,
}: {
  detail: GroupBuyDetail;
  canEdit: boolean;
  busy: boolean;
  onAddOrder: () => void;
  onMarkArrived: (o: GroupBuyOrder) => void;
  onCheck: (o: GroupBuyOrder) => void;
  onUndo: (o: GroupBuyOrder) => void;
  onDelete: (o: GroupBuyOrder) => void;
  onEdit: (o: GroupBuyOrder) => void;
}) {
  const orders = detail.orders ?? [];
  const counts = packageCounts(detail.lines);
  const isHost = detail.is_host;
  return (
    <section
      className="gb-packages"
      aria-label="Packages"
      data-testid="gb-packages"
    >
      <h2 className="gb-section-heading">
        Packages{orders.length ? ` · ${orders.length}` : ""}
      </h2>
      {orders.length === 0 ? (
        <p className="gb-empty">
          {isHost ? (
            <>
              Checked out on TCGplayer? Add each seller's order from Order
              History.
              {detail.status !== "completed" ? (
                <>
                  {" "}
                  <button
                    type="button"
                    className="gb-link-btn"
                    onClick={onAddOrder}
                  >
                    Add order
                  </button>
                </>
              ) : null}
            </>
          ) : (
            "The host hasn't added orders yet."
          )}
        </p>
      ) : (
        <>
          <ProgressBar
            counts={counts}
            label="Packages"
            notOrderedLink={detail.status === "ordered"}
          />
          {isHost ? (
            <HostPackages
              detail={detail}
              canEdit={canEdit}
              busy={busy}
              onMarkArrived={onMarkArrived}
              onCheck={onCheck}
              onUndo={onUndo}
              onDelete={onDelete}
              onEdit={onEdit}
            />
          ) : (
            <ul className="gb-order-rows">
              {orders.map((o) => (
                <MemberOrderRow key={o.id} order={o} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
