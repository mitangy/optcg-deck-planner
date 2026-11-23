import { Menu, MenuButton, MenuItem, MenuList } from "@optcg/ui/popups";
import { copyText } from "@optcg/ui/clipboard";
import { useState } from "react";
import type { GroupBuyDetail, GroupBuyLine, GroupBuyOrder } from "../../api";
import { CardThumb } from "../../ui/CardThumb";
import { MoreIcon } from "../../ui/HeadPopover";
import {
  countsTotal,
  orderChip,
  orderLineArt,
  orderTitle,
  packageCounts,
  progressLabels,
  type ChipTone,
  type PackageCounts,
} from "./groupBuyOrders";

const MAX_THUMBS = 6;

export function StatusChip({ label, tone }: { label: string; tone: ChipTone }) {
  const mark = tone === "done" ? "✓ " : tone === "way" ? "→ " : tone === "none" ? "○ " : "! ";
  return (
    <span className={`gb-chip gb-chip-${tone}`}>
      <span aria-hidden="true">{mark}</span>
      {label}
    </span>
  );
}

/** Three segments (solid, striped, empty) and the same numbers as words, so colour is never the only signal. */
export function ProgressBar({ counts, label }: { counts: PackageCounts; label: string }) {
  const total = Math.max(1, countsTotal(counts));
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="gb-progress">
      <div className="gb-progress-bar" role="img" aria-label={`${label}: ${progressLabels(counts).join(", ")}`}>
        <span className="gb-progress-seg arrived" style={{ width: pct(counts.arrived) }} />
        <span className="gb-progress-seg onway" style={{ width: pct(counts.onTheWay) }} />
      </div>
      <p className="gb-progress-text" aria-hidden="true">
        {progressLabels(counts).map((t) => (
          <span key={t}>{t}</span>
        ))}
      </p>
    </div>
  );
}

function OrderThumbs({ order, lines }: { order: GroupBuyOrder; lines: GroupBuyLine[] }) {
  const byCard = new Map(lines.map((l) => [l.card_id, l]));
  const shown = order.lines.slice(0, MAX_THUMBS);
  const more = order.lines.length - shown.length;
  if (order.lines.length === 0) return <p className="muted gb-order-empty">No cards in this order.</p>;
  return (
    <div className="gb-order-thumbs">
      {shown.map((l) => (
        <span key={l.id} className="gb-order-thumb" title={`${l.qty_ordered} × ${l.name || l.card_id}`}>
          <CardThumb src={orderLineArt(byCard.get(l.card_id), l.product_id)} cardId={l.card_id} alt={l.name || l.card_id} productId={l.product_id ?? undefined} />
          <span className="gb-order-thumb-qty">×{l.qty_ordered}</span>
        </span>
      ))}
      {more > 0 ? <span className="gb-order-more">+{more}</span> : null}
    </div>
  );
}

function OrderCard({
  order,
  index,
  lines,
  isHost,
  canEdit,
  busy,
  onMarkArrived,
  onCheck,
  onUndo,
  onDelete,
}: {
  order: GroupBuyOrder;
  index: number;
  lines: GroupBuyLine[];
  isHost: boolean;
  canEdit: boolean;
  busy: boolean;
  onMarkArrived: (o: GroupBuyOrder) => void;
  onCheck: (o: GroupBuyOrder) => void;
  onUndo: (o: GroupBuyOrder) => void;
  onDelete: (o: GroupBuyOrder) => void;
}) {
  const chip = orderChip(order);
  const [copied, setCopied] = useState(false);
  const arrivedAny = order.qty_arrived > 0;
  const manage = isHost && canEdit;
  const menuItems = [
    arrivedAny ? { key: "undo", label: "Undo arrival", run: () => onUndo(order), danger: false } : null,
    !arrivedAny ? { key: "delete", label: "Delete order", run: () => onDelete(order), danger: true } : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);
  return (
    <li className="gb-order" data-testid="gb-order" data-status={order.status}>
      <div className="gb-order-head">
        <h3 className="gb-order-title">{orderTitle(order, index)}</h3>
        <StatusChip {...chip} />
      </div>
      <p className="gb-order-meta muted">
        {order.qty_arrived} of {order.qty_ordered} {order.qty_ordered === 1 ? "copy" : "copies"} arrived
        {order.qty_extra > 0 ? ` · ${order.qty_extra} extra` : ""}
        {isHost && order.order_number ? (
          <>
            {" · "}
            <button
              type="button"
              className="gb-link-btn"
              aria-label={`Copy order number ${order.order_number}`}
              onClick={async () => {
                setCopied(await copyText(order.order_number));
                setTimeout(() => setCopied(false), 1600);
              }}
            >
              {copied ? "Copied" : "Copy order number"}
            </button>
          </>
        ) : null}
      </p>
      <OrderThumbs order={order} lines={lines} />
      <div className="gb-order-actions">
        {manage && order.status !== "arrived" && order.lines.length > 0 ? (
          <>
            <button type="button" className="btn primary" disabled={busy} onClick={() => onMarkArrived(order)}>
              Mark arrived
            </button>
            <button type="button" className="btn secondary" disabled={busy} onClick={() => onCheck(order)}>
              Check items
            </button>
          </>
        ) : null}
        {manage && order.status === "arrived" && order.lines.length > 0 ? (
          <button type="button" className="btn secondary" disabled={busy} onClick={() => onCheck(order)}>
            Check items
          </button>
        ) : null}
        {order.tracking_url ? (
          <a className="btn secondary gb-track" href={order.tracking_url} target="_blank" rel="noopener noreferrer">
            Track package
          </a>
        ) : null}
        {manage && menuItems.length > 0 ? (
          <Menu as="div" className="head-popover gb-more">
            <MenuButton type="button" className="ghost gb-more-btn" aria-label={`More for ${orderTitle(order, index)}`} title="More">
              <MoreIcon />
            </MenuButton>
            <MenuList
              anchor={{ to: "bottom end", gap: 6, padding: 8 }}
              className="head-popover-panel head-popover-menu"
              style={{ width: "min(14rem, calc(100vw - 16px))" }}
            >
              {menuItems.map((m) => (
                <MenuItem key={m.key} disabled={busy}>
                  <button type="button" className={m.danger ? "danger" : undefined} onClick={m.run}>
                    {m.label}
                  </button>
                </MenuItem>
              ))}
            </MenuList>
          </Menu>
        ) : null}
      </div>
    </li>
  );
}

/** One line per package for members: seller, status and a Track link. No host buttons. */
function MemberOrderRow({ order, index }: { order: GroupBuyOrder; index: number }) {
  const chip = orderChip(order);
  return (
    <li className="gb-order-row" data-testid="gb-order">
      <span className="gb-order-row-name">{order.seller_name.trim() || `Order ${index + 1}`}</span>
      <StatusChip {...chip} />
      {order.tracking_url ? (
        <a className="gb-link-btn" href={order.tracking_url} target="_blank" rel="noopener noreferrer">
          Track
        </a>
      ) : null}
    </li>
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
}: {
  detail: GroupBuyDetail;
  canEdit: boolean;
  busy: boolean;
  onAddOrder: () => void;
  onMarkArrived: (o: GroupBuyOrder) => void;
  onCheck: (o: GroupBuyOrder) => void;
  onUndo: (o: GroupBuyOrder) => void;
  onDelete: (o: GroupBuyOrder) => void;
}) {
  const orders = detail.orders ?? [];
  const counts = packageCounts(detail.lines);
  const isHost = detail.is_host;
  return (
    <section className="gb-packages" aria-label="Packages" data-testid="gb-packages">
      <h2 className="gb-section-heading">Packages{orders.length ? ` · ${orders.length}` : ""}</h2>
      {orders.length === 0 ? (
        <p className="gb-empty">
          {isHost ? (
            <>
              Checked out on TCGplayer? Add each seller's order from Order History.
              {detail.status !== "completed" ? (
                <>
                  {" "}
                  <button type="button" className="gb-link-btn" onClick={onAddOrder}>
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
          <ProgressBar counts={counts} label="Packages" />
          {isHost ? (
            <ul className="gb-order-list">
              {orders.map((o, i) => (
                <OrderCard
                  key={o.id}
                  order={o}
                  index={i}
                  lines={detail.lines}
                  isHost
                  canEdit={canEdit}
                  busy={busy}
                  onMarkArrived={onMarkArrived}
                  onCheck={onCheck}
                  onUndo={onUndo}
                  onDelete={onDelete}
                />
              ))}
            </ul>
          ) : (
            <ul className="gb-order-rows">
              {orders.map((o, i) => (
                <MemberOrderRow key={o.id} order={o} index={i} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
