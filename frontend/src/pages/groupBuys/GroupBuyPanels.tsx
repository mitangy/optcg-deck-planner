import { GroupBuyDetail, money } from "../../api";
import { CollapsibleDrawer } from "../../cardListControls";
import { type ReactNode } from "react";
import { MemberSwatch } from "./memberColors";
import { MemberModeTag } from "./memberParts";
import { SHIPPING_SPLIT_LABELS } from "./shipping";
import { MEMBERS_OPEN_KEY, SETTLEMENT_OPEN_KEY } from "../../storage/keys";

/** Locked, ordered or purchased group buys show shipping, tax and what each member owes. */
export function hasOrderPanel(detail: Pick<GroupBuyDetail, "status">): boolean {
  return detail.status === "locked" || detail.status === "ordered" || detail.status === "completed";
}

/** Members drawer: who is in, their copies and cost (plus ship / tax / owes once ordering starts). */
export function GroupBuyMembersList({ detail }: { detail: GroupBuyDetail }) {
  const members = detail.members ?? [];
  const showOrderPanel = hasOrderPanel(detail);
  return (
    <div className="group-buy-members">
      <CollapsibleDrawer
        label="Members"
        summary={`${detail.member_count} · ${money(detail.grand_total || detail.remaining_market)}`}
        storageKey={MEMBERS_OPEN_KEY}
        defaultOpen
      >
        <ul>
          {members.map((m) => (
            <li key={m.user_id}>
              <MemberSwatch userId={m.user_id} members={members} title={m.display_name} />
              <strong>
                {m.display_name}
                {m.role === "host" ? " (host)" : ""}
              </strong>
              <MemberModeTag member={m} />
              <span className="muted">
                {" "}
                · {m.cards_still_needed} copies · cards {money(m.card_cost ?? m.remaining_market)}
                {showOrderPanel ? (
                  <>
                    {" "}
                    · ship {money(m.shipping_share ?? 0)} · tax {money(m.tax_share ?? 0)}
                    {" · owes "}
                    <strong className="group-buy-owes">{money(m.total_owed ?? m.remaining_market)}</strong>
                  </>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </CollapsibleDrawer>
    </div>
  );
}

/** Shipping / tax / order notes as plain text, for anyone who cannot edit them. */
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

/** Order & settlement drawer with the cards + shipping + tax total; `children` add what the host can edit. */
export function GroupBuySettlement({
  detail,
  readOnly = false,
  children,
}: {
  detail: GroupBuyDetail;
  /** The invite view skips the host-facing next-step hint. */
  readOnly?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="group-buy-settlement">
      <CollapsibleDrawer
        label="Order & settlement"
        summary={`${money(detail.grand_total)} total`}
        storageKey={SETTLEMENT_OPEN_KEY}
        defaultOpen
      >
        <p className="muted">
          {readOnly ? null : (
            <>
              {detail.status === "locked"
                ? "After checkout, mark ordered. Import a TCGPlayer receipt (required), then Mark purchased for matched copies only."
                : detail.status === "ordered"
                  ? "Order placed — settle costs below. Import a TCGPlayer receipt (required), then Mark purchased to update Owned for matched copies."
                  : "Purchased — Owned updated for matched receipt cards. Settlement below is for your records. Hosts can Undo Mark purchased to restore the pool."}{" "}
            </>
          )}
          Cards {money(detail.cards_subtotal)} + shipping {money(detail.shipping_cost)} + tax{" "}
          {money(detail.tax_cost ?? 0)} ={" "}
          <strong className="group-buy-owes">{money(detail.grand_total)}</strong>
          {detail.ordered_at ? ` · ordered ${new Date(detail.ordered_at).toLocaleString()}` : ""}
        </p>
        {children}
      </CollapsibleDrawer>
    </div>
  );
}
