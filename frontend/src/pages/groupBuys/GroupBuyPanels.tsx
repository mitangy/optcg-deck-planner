import { GroupBuyDetail, GroupBuyMember, money } from "../../api";
import { CollapsibleDrawer } from "../../ui/cardListControls";
import { type ReactNode } from "react";
import { MemberSwatch } from "./memberColors";
import { MemberModeTag, OfflineTag } from "./memberParts";
import { OfflineMemberMenu } from "./OfflineMembers";
import { SHIPPING_SPLIT_LABELS } from "./shipping";
import { MEMBERS_OPEN_KEY, SETTLEMENT_OPEN_KEY } from "../../storage/keys";

export function hasOrderPanel(detail: Pick<GroupBuyDetail, "status">): boolean {
  return detail.status === "locked" || detail.status === "ordered" || detail.status === "completed";
}

export function GroupBuyMembersList({
  detail,
  onAddOffline,
  onRenameOffline,
  onRemoveOffline,
}: {
  detail: GroupBuyDetail;
  /** Host only, until completed: add someone who is not on the app, then rename or remove them. */
  onAddOffline?: () => void;
  onRenameOffline?: (member: GroupBuyMember) => void;
  /** Return nothing for a member who cannot be removed (they still have copies once locked). */
  onRemoveOffline?: (member: GroupBuyMember) => (() => void) | undefined;
}) {
  const members = detail.members ?? [];
  const showOrderPanel = hasOrderPanel(detail);
  return (
    <div className="group-buy-members">
      <CollapsibleDrawer
        label="Members"
        summary={
          <span className="gb-member-chips">
            {members.map((m) => (
              <span key={m.user_id} className="gb-member-chip">
                <MemberSwatch userId={m.user_id} members={members} />
                <span className="gb-member-chip-name">{m.display_name}</span>
                {m.role === "host" ? <span className="gb-member-chip-host">host</span> : null}
                {m.is_offline ? <span className="gb-member-chip-host">not on the app</span> : null}
              </span>
            ))}
          </span>
        }
        hideSummaryWhenOpen
        storageKey={MEMBERS_OPEN_KEY}
      >
        <ul>
          {members.map((m) => (
            <li key={m.user_id}>
              <span className="gb-member-name">
                <MemberSwatch userId={m.user_id} members={members} title={m.display_name} />
                <strong>
                  {m.display_name}
                  {m.role === "host" ? " (host)" : ""}
                </strong>
                <MemberModeTag member={m} />
                {m.is_offline ? <OfflineTag /> : null}
                {m.is_offline && onRenameOffline ? (
                  <OfflineMemberMenu
                    member={m}
                    onRename={() => onRenameOffline(m)}
                    onRemove={onRemoveOffline?.(m)}
                  />
                ) : null}
              </span>
              <span className="gb-member-stats muted">
                <span>{m.cards_still_needed} copies</span>
                <span>cards {money(m.card_cost ?? m.remaining_market)}</span>
                {showOrderPanel ? (
                  <>
                    <span>ship {money(m.shipping_share ?? 0)}</span>
                    <span>tax {money(m.tax_share ?? 0)}</span>
                    <span>
                      owes <strong className="group-buy-owes">{money(m.total_owed ?? m.remaining_market)}</strong>
                    </span>
                    {m.role !== "host" && m.handoff_status ? (
                      <span className={`gb-paid-tag${m.paid ? " on" : ""}`}>
                        <span aria-hidden="true">{m.paid ? "✓ " : "○ "}</span>
                        {m.paid ? "Paid" : "Not paid"}
                      </span>
                    ) : null}
                  </>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
        {onAddOffline ? (
          <button type="button" className="btn secondary gb-add-offline" data-testid="gb-add-offline" onClick={onAddOffline}>
            Add someone not on the app
          </button>
        ) : null}
      </CollapsibleDrawer>
    </div>
  );
}

export function GroupBuyOrderDetails({ detail }: { detail: GroupBuyDetail }) {
  return (
    <div className="group-buy-order-readonly">
      {detail.external_order_id ? (
        <p>
          Order id: <strong>{detail.external_order_id}</strong>
        </p>
      ) : null}
      <p className="muted">
        Shipping split:{" "}
        {SHIPPING_SPLIT_LABELS[
          detail.shipping_split === "by_cost" || detail.shipping_split === "by_copies"
            ? detail.shipping_split
            : "equal"
        ]}
        {" · Tax split: by card cost"}
        {(detail.tax_cost ?? 0) > 0 ? ` (${money(detail.tax_cost)})` : ""}
      </p>
      {detail.order_notes ? <p>{detail.order_notes}</p> : null}
    </div>
  );
}

/** "Nov 18": the day the order was placed, without the clock time. */
export function shortOrderedDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function GroupBuySettlement({
  detail,
  children,
}: {
  detail: GroupBuyDetail;
  readOnly?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="group-buy-settlement">
      <CollapsibleDrawer label="Order & settlement" storageKey={SETTLEMENT_OPEN_KEY} defaultOpen>
        <dl className="gb-receipt" aria-label="Order totals">
          <div>
            <dt>Cards</dt>
            <dd>{money(detail.cards_subtotal)}</dd>
          </div>
          <div>
            <dt>Shipping</dt>
            <dd>{money(detail.shipping_cost)}</dd>
          </div>
          <div>
            <dt>Tax</dt>
            <dd>{money(detail.tax_cost ?? 0)}</dd>
          </div>
          <div className="gb-receipt-total">
            <dt>Total</dt>
            <dd className="group-buy-owes">{money(detail.grand_total)}</dd>
          </div>
        </dl>
        {detail.ordered_at ? <p className="gb-receipt-date muted">Ordered {shortOrderedDate(detail.ordered_at)}</p> : null}
        {children}
      </CollapsibleDrawer>
    </div>
  );
}
