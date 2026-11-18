import { AltArtsRow, MarketPrice } from "../../cards/MarketPrice";
import { GroupBuyLine, GroupBuyMember, GroupBuyMemberQty, money } from "../../api";
import { shownMarket } from "../../cards/altArt";
import { mySelectedArtsTotal } from "./groupBuyArt";
import { MemberSwatch, memberColor } from "./memberColors";

export function MemberModeTag({ member }: { member: GroupBuyMember }) {
  if (member.sum_across_leaders == null) return null;
  const separate = member.sum_across_leaders;
  return (
    <span
      className={`member-mode-tag${separate ? " separate" : ""}`}
      title={
        separate
          ? "Copies needed: separate per leader. Their counts add up across different leaders (Luffy 4 + Sabo 3 = 7)."
          : "Copies needed: shared between leaders. Their counts use the most any one deck needs (Luffy 4, Sabo 3 = 4)."
      }
    >
      {separate ? "Separate per leader" : "Shared between leaders"}
    </span>
  );
}

export function MemberBreakdown({
  line,
  members,
}: {
  line: GroupBuyLine;
  members: GroupBuyMember[];
}) {
  if (!line.members.length) return <span className="muted">—</span>;
  return (
    <span className="group-buy-who">
      {line.members.map((m: GroupBuyMemberQty) => (
        <span key={m.user_id} className="group-buy-who-chip">
          <MemberSwatch userId={m.user_id} members={members} title={m.display_name} />
          <span>
            {m.display_name} ×{m.qty}
          </span>
          {m.is_custom ? (
            <span className="group-buy-custom-tag" title="Custom quantity, not Shopping still-need">
              custom
            </span>
          ) : null}
        </span>
      ))}
    </span>
  );
}

export function ArtWantChips({
  line,
  productId,
  members,
}: {
  line: GroupBuyLine;
  productId: number;
  members: GroupBuyMember[];
}) {
  const target = productId === 0 ? line.preferred_product_id : productId;
  const wants = (line.art_wants ?? []).filter((w) => w.product_id === target && w.qty > 0);
  if (!wants.length) return null;
  return (
    <span className="alt-art-wants">
      {wants.map((w) => {
        const name = members.find((m) => m.user_id === w.user_id)?.display_name ?? "Member";
        return (
          <span key={w.user_id} className="group-buy-who-chip" title={`${name} wants ×${w.qty}`}>
            <MemberSwatch userId={w.user_id} members={members} />
            <span className="alt-art-want-text">
              {name} ×{w.qty}
            </span>
          </span>
        );
      })}
    </span>
  );
}

export function SkippedBadge({ line, productId }: { line: GroupBuyLine; productId: number }) {
  const skipped = (line.my_extras ?? []).some((e) => e.product_id === productId && e.skipped > 0);
  if (!skipped) return null;
  return (
    <span className="alt-art-wants">
      <span className="group-buy-who-chip group-buy-skipped-chip" data-testid="gb-skipped-badge">
        Skipped this buy
      </span>
    </span>
  );
}

/** The alt arts somebody in the group buy wants; the read-only view shows only those. */
export function wantedAlts(line: GroupBuyLine) {
  const wanted = new Set((line.art_wants ?? []).map((w) => w.product_id));
  return (line.alt_arts ?? []).filter((a) => wanted.has(a.product_id));
}

export function readOnlyAltRow(line: GroupBuyLine, members: GroupBuyMember[]) {
  const alts = wantedAlts(line);
  if (!alts.length) return null;
  return (
    <AltArtsRow
      base={{
        name: line.name,
        image_url: line.base_image_url || undefined,
        market_price: line.preferred_market_price ?? null,
        product_id: line.preferred_product_id ?? null,
      }}
      alts={alts}
      cardId={line.card_id}
      tileExtra={(productId) => <ArtWantChips line={line} productId={productId} members={members} />}
    />
  );
}

export function MemberColorRail({
  line,
  members,
}: {
  line: GroupBuyLine;
  members: GroupBuyMember[];
}) {
  const active = line.members.filter((m) => m.qty > 0);
  if (!active.length) return null;
  return (
    <span className="group-buy-color-rail" aria-hidden="true">
      {active.map((m) => (
        <span key={m.user_id} style={{ background: memberColor(m.user_id, members) }} />
      ))}
    </span>
  );
}

/** Yours: what the signed-in member pays for their own copies of this line, on its own line. */
export function GroupBuyYours({ line }: { line: GroupBuyLine }) {
  if (line.my_qty <= 0) return null;
  const t = mySelectedArtsTotal(line);
  return (
    <span className="gb-arts-total" title={t.breakdown} data-testid="gb-arts-total">
      <span className="gb-arts-total-cap muted">Yours</span>{" "}
      <span className="gb-arts-total-amount">{money(t.total)}</span>{" "}
      <span className="gb-arts-total-cap muted">
        · {t.copies} {t.copies === 1 ? "copy" : "copies"}
      </span>
    </span>
  );
}

/** Each (the shown art's market price), Line total (what the whole pool pays for the line) and Yours, in one vocabulary. */
export function GroupBuyPrices({ line }: { line: GroupBuyLine }) {
  const shown = shownMarket(line);
  return (
    <div className="gb-prices">
      <span className="gb-price-line gb-price-each">
        <span className="muted">Each</span>{" "}
        <MarketPrice price={shown.price} productId={shown.productId} />
      </span>
      <span className="gb-price-line gb-price-total">
        <span className="muted">Line total</span>{" "}
        <span className="gb-price-amount">{money(line.remaining_cost)}</span>
      </span>
      <GroupBuyYours line={line} />
    </div>
  );
}
