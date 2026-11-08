import { useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Popover, PopoverBackdrop, PopoverButton, PopoverPanel } from "@optcg/ui/popups";
import { money, type PrintingView } from "../../api";
import { CardThumb } from "../../ui/CardThumb";
import { canOpenBuyPopover, collectorChoices } from "../collection/collectorLines";
import { altBuyCopies, splitStillNeed } from "./deckCost";
import { useMediaQuery } from "@optcg/ui/hooks";

/** Phone layout: the list view's breakpoint (styles.css `max-width: 800px`). */
const PHONE_QUERY = "(max-width: 800px)";

export type BuySplitCard = {
  card_id: string;
  name: string;
  image_url?: string | null;
  market_price: number | null;
  still_need: number;
  alt_arts?: PrintingView[] | null;
};

/** True when the price can open the split: the card has alt arts and copies still to buy. */
export function canSplitBuy(card: Pick<BuySplitCard, "still_need" | "alt_arts">): boolean {
  return card.still_need > 0 && (card.alt_arts?.length ?? 0) > 0;
}

/** Caption under the amount once picks apply: "1 alt + 1 base" (just "2 alt" when nothing is left for base). */
export function buySplitCaption(card: Pick<BuySplitCard, "still_need" | "market_price" | "alt_arts">): string | null {
  if (card.still_need <= 0) return null;
  const { altCopies, baseCopies } = splitStillNeed(card);
  if (altCopies <= 0) return null;
  return `${altCopies} alt${baseCopies > 0 ? ` + ${baseCopies} base` : ""}`;
}

/** Copies left for the standard art once the alt picks come out of what is still needed. */
export function baseCopiesLeft(card: Pick<BuySplitCard, "still_need" | "alt_arts">): number {
  const picked = (card.alt_arts ?? []).reduce((n, a) => n + altBuyCopies(a), 0);
  return Math.max(0, card.still_need - picked);
}

/**
 * The panel body: how the still-needed copies of one card are bought, split between
 * the standard art (read-only, takes whatever is left) and each alt art (steppers).
 */
export function BuySplitEditor({
  card,
  busyProductId = null,
  onPick,
  onCollectorPick,
}: {
  card: BuySplitCard;
  busyProductId?: number | null;
  onPick: (productId: number, qty: number) => void;
  /** Planner pages (#1031): adds the "Want an extra copy too" art picker under the split. */
  onCollectorPick?: (productId: number, qty: number) => void;
}) {
  const alts = card.alt_arts ?? [];
  const base = baseCopiesLeft(card);
  const blockedTitle = `All ${card.still_need} still-needed ${card.still_need === 1 ? "copy is" : "copies are"} already picked`;
  const total = splitStillNeed(card).cost;
  const titleId = useId();
  const splitting = card.still_need > 0;
  return (
    <div className="buy-split-editor" aria-labelledby={titleId}>
      {splitting ? (
        <>
      <h3 className="buy-split-title" id={titleId}>
        Buy your {card.still_need} {card.still_need === 1 ? "copy" : "copies"} as…
      </h3>
      {/* Steppers use aria-disabled, not disabled: a disabled button drops focus, and Escape would stop closing the panel. */}
      <ul className="buy-split-rows">
        <li className="buy-split-row">
          <span className="buy-split-thumb">
            <CardThumb src={card.image_url || undefined} cardId={card.card_id} alt={`${card.name} base art`} productId={0} />
          </span>
          <span className="buy-split-art">
            <span className="buy-split-art-name">Base</span>
            <span className="buy-split-art-price">{money(card.market_price)}</span>
          </span>
          <span className="buy-split-qty buy-split-base-qty" aria-label="Base copies to buy">
            ×{base}
          </span>
        </li>
        {alts.map((alt) => {
          const wanted = alt.wanted ?? 0;
          const busy = busyProductId === alt.product_id;
          return (
            <li key={alt.product_id} className="buy-split-row">
              <span className="buy-split-thumb">
                <CardThumb src={alt.image_url || undefined} cardId={card.card_id} alt={alt.name} productId={alt.product_id} />
              </span>
              <span className="buy-split-art">
                <span className="buy-split-art-name" title={alt.name}>
                  {alt.name}
                </span>
                <span className="buy-split-art-price">{money(alt.market_price)}</span>
              </span>
              <span className="owned-wrap buy-split-stepper">
                <button
                  type="button"
                  className="owned-btn"
                  aria-label={`Decrease ${alt.name} to buy`}
                  aria-disabled={busy || wanted <= 0}
                  onClick={() => !busy && wanted > 0 && onPick(alt.product_id, wanted - 1)}
                >
                  −
                </button>
                <span className="buy-split-qty" aria-label={`${alt.name} to buy`}>
                  {wanted}
                </span>
                <button
                  type="button"
                  className="owned-btn"
                  aria-label={`Increase ${alt.name} to buy`}
                  aria-disabled={busy || base <= 0}
                  title={base <= 0 ? blockedTitle : undefined}
                  onClick={() => !busy && base > 0 && onPick(alt.product_id, wanted + 1)}
                >
                  +
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="buy-split-total">
        <span>Total</span>
        <strong>{total == null ? "—" : money(total)}</strong>
      </p>
        </>
      ) : (
        <h3 className="buy-split-title" id={titleId}>
          You have every copy your decks need
        </h3>
      )}
      {onCollectorPick ? (
        <CollectorPicker card={card} startOpen={!splitting} busyProductId={busyProductId} onPick={onCollectorPick} />
      ) : null}
    </div>
  );
}

/**
 * "★ Want an extra copy too": an alt art wanted on top of the decks (#1031). Picking sets one copy;
 * the count is edited on the Master Shopping line it creates.
 */
function CollectorPicker({
  card,
  startOpen,
  busyProductId,
  onPick,
}: {
  card: BuySplitCard;
  startOpen: boolean;
  busyProductId: number | null;
  onPick: (productId: number, qty: number) => void;
}) {
  const [open, setOpen] = useState(startOpen);
  const listId = useId();
  const choices = collectorChoices(card.alt_arts);
  if (choices.length === 0) return null;
  return (
    <div className="collector-add">
      <button
        type="button"
        className="collector-add-toggle"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="collector-star" aria-hidden="true">
          ★
        </span>
        <span className="collector-add-text">Want an extra copy too</span>
        <span className="collector-add-hint">on top of your decks</span>
      </button>
      {open ? (
        <ul className="collector-picker" id={listId} aria-label="Which art for your collector copy?">
          {choices.map((alt) => {
            const added = (alt.collector ?? 0) > 0;
            return (
              <li key={alt.product_id} className="collector-picker-row">
                <span className="buy-split-thumb">
                  <CardThumb src={alt.image_url || undefined} cardId={card.card_id} alt={alt.name} productId={alt.product_id} />
                </span>
                <span className="buy-split-art">
                  <span className="buy-split-art-name" title={alt.name}>
                    {alt.name}
                  </span>
                  <span className="buy-split-art-price">{money(alt.market_price)}</span>
                </span>
                {added ? (
                  <span className="collector-chip">★ Added</span>
                ) : (
                  <button
                    type="button"
                    className="collector-pick-btn"
                    aria-label={`Pick ${alt.name} as a collector copy`}
                    aria-disabled={busyProductId === alt.product_id}
                    onClick={() => busyProductId !== alt.product_id && onPick(alt.product_id, 1)}
                  >
                    Pick
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

const stopBubble = (e: { stopPropagation(): void }) => e.stopPropagation();

/**
 * The price of what is still needed, as the control that splits the buy between the base art and
 * the alt arts (#906). Cards with no alt arts, nothing left to buy, or no way to save render the
 * same box as plain text so rows never shift. The panel floats (anchored popover, or a bottom
 * sheet on phones), so opening it never moves the trigger.
 */
export function BuySplit({
  card,
  amount,
  prefix = "",
  onPick,
  busyProductId = null,
  plainWhenIdle = true,
  onCollectorPick,
}: {
  card: BuySplitCard;
  /** The formatted remaining cost, e.g. "$2.50". */
  amount: ReactNode;
  /** Text before the amount, e.g. "Left ". */
  prefix?: string;
  onPick?: (productId: number, qty: number) => void;
  busyProductId?: number | null;
  /** When there is nothing to split: keep the amount as plain text (false renders nothing). */
  plainWhenIdle?: boolean;
  /** Planner pages (#1031): with this the price opens even when nothing is left to buy, for the collector picker. */
  onCollectorPick?: (productId: number, qty: number) => void;
}) {
  const phone = useMediaQuery(PHONE_QUERY);
  const eligible = Boolean(onPick) && canOpenBuyPopover(card, Boolean(onCollectorPick));
  if (!eligible || !onPick) {
    return plainWhenIdle ? (
      <span className="buy-split">
        <span className="buy-split-box">
          {prefix}
          {amount}
        </span>
      </span>
    ) : null;
  }
  const caption = buySplitCaption(card);
  return (
    // The panel renders in a portal but React events still bubble to the row, which selects on tap.
    <span className="buy-split" onClick={stopBubble} onKeyDown={stopBubble}>
      <Popover as="span" className="buy-split-pop">
        <PopoverButton
          type="button"
          className="buy-split-box buy-split-btn"
          title={`Choose which art to buy for ${card.name}`}
          data-buy-split={card.card_id}
        >
          <span className="buy-split-amount">
            {prefix}
            {amount}
            <span className="buy-split-chevron" aria-hidden="true">
              {" "}
              ▾
            </span>
          </span>
          {caption ? <span className="buy-split-caption">{caption}</span> : null}
        </PopoverButton>
        {/* Phone sheet: dim the page behind it. In a portal so no table cell or card can trap it under the list. */}
        {phone
          ? createPortal(<PopoverBackdrop transition className="buy-split-backdrop" data-testid="buy-split-backdrop" />, document.body)
          : null}
        <PopoverPanel
          anchor={phone ? false : { to: "bottom start", gap: 6, padding: 8 }}
          portal
          role="dialog"
          aria-label={`Buy ${card.name} as`}
          className={`buy-split-panel${phone ? " buy-split-sheet" : ""}`}
        >
          <BuySplitEditor card={card} busyProductId={busyProductId} onPick={onPick} onCollectorPick={onCollectorPick} />
        </PopoverPanel>
      </Popover>
    </span>
  );
}
