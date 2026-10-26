import type { ReactNode } from "react";
import { Popover, PopoverButton, PopoverPanel } from "@optcg/ui/popups";
import { money, type OwnedCollectionResponse } from "./api";
import { COLOR_ORDER } from "./cardListControls";
import { cardColorNames } from "./collectionView";

/** Summary cards under the page title: unique cards, total copies and estimated value. */
export function CollectionStatCards({ data }: { data: OwnedCollectionResponse | undefined }) {
  return (
    <ul className="stat-cards" aria-label="Collection totals">
      <li>
        <span className="stat-label">Unique cards</span>
        <span className="stat-value">{data?.unique_cards ?? 0}</span>
      </li>
      <li>
        <span className="stat-label">Copies</span>
        <span className="stat-value">{data?.total_copies ?? 0}</span>
      </li>
      <li>
        <span className="stat-label">Est. value</span>
        <span className="stat-value gold">{money(data?.total_value ?? 0)}</span>
        {data?.unpriced_cards ? <span className="stat-note">+ {data.unpriced_cards} unpriced</span> : null}
      </li>
    </ul>
  );
}

function ColorDot({ color }: { color: string }) {
  return <span className="color-dot" data-color={color.toLowerCase()} aria-hidden="true" />;
}

/** A small pill per colour of a card (a two-colour card gets two). */
export function CardColorChips({ color }: { color: string }) {
  const names = cardColorNames({ color });
  if (!names.length) return null;
  return (
    <span className="color-chips">
      {names.map((name) => (
        <span key={name} className="color-chip">
          <ColorDot color={name} />
          {name}
        </span>
      ))}
    </span>
  );
}

/** Round colour buttons; any number can be on at once. */
export function ColorFilterChips({
  selected,
  onToggle,
  onClear,
}: {
  selected: string[];
  onToggle: (color: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="color-filter" role="group" aria-label="Colors">
      {COLOR_ORDER.map((color) => {
        const on = selected.includes(color);
        return (
          <button
            key={color}
            type="button"
            className={`color-filter-btn${on ? " on" : ""}`}
            aria-pressed={on}
            aria-label={color}
            title={color}
            onClick={() => onToggle(color)}
          >
            <ColorDot color={color} />
          </button>
        );
      })}
      {/* Always rendered (just dimmed), so turning the first colour on never moves the chips beside it. */}
      <button
        type="button"
        className="color-filter-clear"
        aria-label="Any color"
        title="Clear colors"
        disabled={selected.length === 0}
        onClick={onClear}
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}

/** "All" plus one pill per card type in the collection (single choice). */
export function TypeFilterChips({
  types,
  value,
  onChange,
}: {
  types: string[];
  value: string;
  onChange: (type: string) => void;
}) {
  const options = ["", ...types];
  return (
    <div className="type-filter" role="group" aria-label="Card type">
      {options.map((t) => (
        <button
          key={t || "all"}
          type="button"
          className={`type-chip${value === t ? " on" : ""}`}
          aria-pressed={value === t}
          onClick={() => onChange(t)}
        >
          {t || "All"}
        </button>
      ))}
    </div>
  );
}

/** The Collection page's yes/no filters, in a Headless UI popover so opening it moves nothing. */
export function CollectionFilterMenu({
  badge,
  children,
}: {
  /** Filters that differ from their defaults. */
  badge: number;
  children: ReactNode;
}) {
  return (
    <Popover as="div" className="collection-filter-menu">
      <PopoverButton type="button" className="sort-menu-btn collection-filter-btn">
        Filters
        <span className={`collection-filter-badge${badge ? "" : " empty"}`} aria-hidden={badge ? undefined : true}>
          {badge || ""}
        </span>
        {badge ? <span className="sr-only"> ({badge} on)</span> : null}
      </PopoverButton>
      <PopoverPanel
        anchor={{ to: "bottom end", gap: 6, padding: 8 }}
        role="dialog"
        aria-label="Collection filters"
        className="collection-filter-panel"
      >
        {children}
      </PopoverPanel>
    </Popover>
  );
}
