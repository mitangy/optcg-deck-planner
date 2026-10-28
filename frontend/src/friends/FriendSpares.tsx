import { Select } from "@optcg/ui/popups";
import { useState } from "react";
import { money } from "../api";
import type { SpareItem, TradeSide } from "./friendsApi";
import { lineCap, lineQty, setLineQty, type TrayCard, type TrayLine } from "./tradeLogic";
import { CardRow, Empty, LoadError, QtyStepper } from "./ui";
import { useFriendSpares } from "./useFriendSpares";

/** The "Standard" printing's option value (no TCGplayer product id is 0). */
const STANDARD_PRINTING = 0;

/** Three lists to build an offer from: what they have that you need, their other spares, and what you have that they need. */
export function FriendSpares({
  friendId,
  username,
  lines,
  onLines,
}: {
  friendId: number;
  username: string;
  lines: TrayLine[];
  onLines: (next: TrayLine[]) => void;
}) {
  const { data, isLoading, error, refetch, capOf } = useFriendSpares(friendId);
  // Chosen printing per row ("get:EB01-001" -> product id); missing = standard printing.
  const [printing, setPrinting] = useState<Record<string, number | null>>({});

  if (isLoading) return <p className="muted">Loading…</p>;
  if (error) return <LoadError error={error} onRetry={() => void refetch()} />;
  const needIds = new Set(data!.you_need.map((i) => i.card_id));
  const others = data!.their_spares.filter((i) => !needIds.has(i.card_id));
  const total = data!.you_need.length + others.length + data!.they_need.length;
  if (total === 0) {
    return <Empty title="Nothing to trade yet">{username} has no spares, and none of yours are on their wish list.</Empty>;
  }

  const renderRow = (item: SpareItem, side: TradeSide) => {
    const rowKey = `${side}:${item.card_id}`;
    // Default to Standard only when they own base copies; otherwise the first alt they own (#705).
    const productId = rowKey in printing ? printing[rowKey] : item.base_owned > 0 ? null : (item.printings[0]?.product_id ?? null);
    const chosen = item.printings.find((p) => p.product_id === productId);
    const card: TrayCard = {
      side,
      cardId: item.card_id,
      productId,
      name: item.name,
      imageUrl: chosen?.image_url || item.image_url,
      marketPrice: item.market_price,
      printingLabel: chosen?.label ?? null,
    };
    const cap = capOf(item);
    const inTray = lines.filter((l) => l.side === side && l.cardId === item.card_id).reduce((n, l) => n + l.qty, 0);
    return (
      <CardRow
        key={`${side}-${item.card_id}`}
        cardId={item.card_id}
        name={item.name}
        imageUrl={item.image_url}
        className={inTray > 0 ? "in-tray" : ""}
        meta={[
          side === "get" ? `${username} has ${item.spare} spare` : `You have ${item.spare} spare`,
          item.want > 0 ? (side === "get" ? `you need ${item.want}` : `${username} needs ${item.want}`) : "",
          item.market_price != null ? money(item.market_price) : "",
        ]
          .filter(Boolean)
          .join(" · ")}
      >
        {item.printings.length > 0 && (
          <Select<number>
            buttonClassName="friend-printing"
            aria-label={`Printing of ${item.card_id}`}
            value={productId ?? STANDARD_PRINTING}
            onChange={(v) => setPrinting((p) => ({ ...p, [rowKey]: v === STANDARD_PRINTING ? null : v }))}
            options={[
              { value: STANDARD_PRINTING, label: `Standard ×${item.base_owned}` },
              ...item.printings.map((p) => ({ value: p.product_id, label: `${p.label} ×${p.owned}` })),
            ]}
          />
        )}
        <QtyStepper
          value={lineQty(lines, card)}
          max={lineCap(lines, card, cap)}
          label={`${item.card_id} to ${side}`}
          onChange={(n) => onLines(setLineQty(lines, card, n, cap))}
        />
      </CardRow>
    );
  };

  const section = (title: string, hint: string, items: SpareItem[], side: TradeSide) =>
    items.length === 0 ? null : (
      <section className="spares-section" aria-label={title}>
        <h2>
          {title} <span className="muted">{items.length}</span>
        </h2>
        <p className="muted friend-lede">{hint}</p>
        <ul className="friend-card-list">
          {items.map((i) => renderRow(i, side))}
        </ul>
      </section>
    );

  return (
    <div className="friend-spares">
      {section("They have, you need", `Spares of ${username}'s that are on your Shopping list.`, data!.you_need, "get")}
      {section("Their spares", `Everything else ${username} can trade.`, others, "get")}
      {section("You have, they need", `Your spares that are on ${username}'s Shopping list.`, data!.they_need, "give")}
    </div>
  );
}
