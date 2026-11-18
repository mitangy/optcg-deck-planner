import { useEffect, useRef } from "react";
import { money } from "../../api";
import { Menu, MenuButton, MenuItem, MenuList } from "@optcg/ui/popups";
import type { MassEntryExport } from "./tcgplayerMassEntry";

export type BuySelection = { count: number; copies: number; total: number; priced: number };

function buyLabel(selected: boolean, cards: number): string {
  return selected ? `Buy ${cards} selected` : "Buy on TCGPlayer";
}

/** The always-visible Buy on TCGPlayer button. With cards ticked it buys those, otherwise every card still to buy. */
export function ShoppingBuyButton({
  selected,
  massEntry,
  busy,
  canMarkBought,
  onBuy,
  onCopy,
  onBuyInPerson,
  plainLabel = false,
  menuAnchor = "bottom end",
}: {
  selected: boolean;
  massEntry: MassEntryExport;
  busy: boolean;
  canMarkBought: boolean;
  onBuy: () => void;
  onCopy: () => void;
  onBuyInPerson: () => void;
  /** Keep the label "Buy on TCGPlayer" even with cards ticked (the selection bar already says how many). */
  plainLabel?: boolean;
  menuAnchor?: "bottom end" | "top end";
}) {
  const none = massEntry.includedCount === 0;
  const scope = selected ? "the selected cards" : "every card still to buy";
  return (
    <Menu as="div" className="tcg-buy">
      <button
        type="button"
        className="btn primary tcg-buy-main"
        disabled={none || busy}
        title={none ? "No cards left to buy" : `Buy on TCGPlayer: open Mass Entry with ${scope}: ${massEntry.includedCount} card${massEntry.includedCount === 1 ? "" : "s"}, ${massEntry.copyCount} cop${massEntry.copyCount === 1 ? "y" : "ies"}`}
        onClick={onBuy}
      >
        {/* Both labels are stacked so the button keeps one width and ticking a card cannot re-wrap the head. */}
        <span className="tcg-buy-label">
          <span aria-hidden="true">{buyLabel(false, 0)}</span>
          <span aria-hidden="true">{buyLabel(true, 888)}</span>
          <span>{buyLabel(selected && !plainLabel, massEntry.includedCount)}</span>
        </span>
      </button>
      <MenuButton type="button" className="btn primary tcg-buy-caret" aria-label="More ways to buy" title="More ways to buy">
        <span aria-hidden="true">▾</span>
      </MenuButton>
      <MenuList anchor={{ to: menuAnchor, gap: 6, padding: 8 }} className="head-popover-panel head-popover-menu" style={{ width: "min(17rem, calc(100vw - 16px))" }}>
        <MenuItem disabled={none || busy}>
          <button type="button" onClick={onCopy}>
            Copy for TCGPlayer
            <span className="muted">Copy the Mass Entry list instead of opening it</span>
          </button>
        </MenuItem>
        <MenuItem disabled={!canMarkBought || busy}>
          <button type="button" onClick={onBuyInPerson}>
            Buying in person
            <span className="muted">{canMarkBought ? "Add the selected copies to Own" : "Tick cards first"}</span>
          </button>
        </MenuItem>
      </MenuList>
    </Menu>
  );
}

/** Bottom bar over the page (not in the flow, so ticking a box moves nothing) for the selection and the last export message. */
export function ShoppingBuyDock({
  selection,
  selected,
  massEntry,
  busy,
  canMarkBought,
  message,
  onBuy,
  onCopy,
  onBuyInPerson,
  onClear,
  onDismissMessage,
}: {
  selection: BuySelection;
  selected: boolean;
  massEntry: MassEntryExport;
  busy: boolean;
  canMarkBought: boolean;
  message: string | null;
  onBuy: () => void;
  onCopy: () => void;
  onBuyInPerson: () => void;
  onClear: () => void;
  onDismissMessage: () => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const shown = selected || Boolean(message);
  // The page gets bottom padding as tall as the bar (plus the tab bar), so the last row is never hidden behind it.
  useEffect(() => {
    const bar = barRef.current;
    const root = document.documentElement;
    if (!shown || !bar) return;
    const update = () => root.style.setProperty("--buy-dock-h", `${Math.ceil(bar.getBoundingClientRect().height)}px`);
    update();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    ro?.observe(bar);
    return () => {
      ro?.disconnect();
      root.style.removeProperty("--buy-dock-h");
    };
  }, [shown]);
  if (!shown) return null;
  return (
    <div className="buy-dock" data-testid="buy-dock">
      <div className="buy-dock-bar" ref={barRef}>
        {selected && (
          <>
            <div className="buy-dock-summary">
              <strong>
                {selection.count} card{selection.count === 1 ? "" : "s"} selected
              </strong>
              <span className="muted">
                {" "}
                · {selection.copies} to buy · {money(selection.total)}
                {selection.priced < selection.count ? " (priced cards only)" : ""}
              </span>
            </div>
            <div className="buy-dock-actions">
              <ShoppingBuyButton
                selected
                plainLabel
                massEntry={massEntry}
                busy={busy}
                canMarkBought={canMarkBought}
                onBuy={onBuy}
                onCopy={onCopy}
                onBuyInPerson={onBuyInPerson}
                menuAnchor="top end"
              />
              <button type="button" className="ghost" onClick={onClear}>
                Clear
              </button>
            </div>
          </>
        )}
        {message ? (
          <p className="buy-dock-msg" role="status">
            <span>{message}</span>
            <button type="button" className="ghost" onClick={onDismissMessage} aria-label="Dismiss message">
              Dismiss
            </button>
          </p>
        ) : null}
      </div>
    </div>
  );
}
