import type { ReactNode } from "react";
import { Popover, PopoverButton, PopoverPanel } from "@optcg/ui/popups";
import { money, type OwnedCollectionResponse } from "../api";
import { COLOR_ORDER } from "./cardListControls";
import { cardColorNames } from "../pages/collection/collectionView";

/** The collection totals, in the same inline strip the Shopping head uses. */
export function CollectionStatStrip({ data }: { data: OwnedCollectionResponse | undefined }) {
  return (
    <ul className="stat-strip" aria-label="Collection totals">
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

export type PillOption = { value: string; label: string; count?: number };

/** Single-choice pills (the card type row, the group buy package status). A count, when given, sits after the label. */
export function PillFilter({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: PillOption[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  return (
    <div className="type-filter" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value || "all"}
          type="button"
          className={`type-chip${value === o.value ? " on" : ""}`}
          aria-pressed={value === o.value}
          aria-label={o.count === undefined ? undefined : `${o.label} (${o.count})`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.count === undefined ? null : <span className="type-chip-n" aria-hidden="true">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function TypeFilterChips({
  types,
  value,
  onChange,
}: {
  types: string[];
  value: string;
  onChange: (type: string) => void;
}) {
  const options = ["", ...types].map((t) => ({ value: t, label: t || "All" }));
  return <PillFilter options={options} value={value} onChange={onChange} ariaLabel="Card type" />;
}

export function CollectionFilterMenu({
  badge,
  label = "Filters",
  children,
}: {
  badge: number;
  label?: string;
  children: ReactNode;
}) {
  return (
    <Popover as="div" className="collection-filter-menu">
      <PopoverButton type="button" className="sort-menu-btn collection-filter-btn">
        {label}
        <span className={`collection-filter-badge${badge ? "" : " empty"}`} aria-hidden={badge ? undefined : true}>
          {badge || ""}
        </span>
        {badge ? <span className="sr-only"> ({badge} on)</span> : null}
      </PopoverButton>
      <PopoverPanel
        anchor={{ to: "bottom end", gap: 6, padding: 8 }}
        role="dialog"
        aria-label="Filters"
        className="collection-filter-panel"
      >
        {children}
      </PopoverPanel>
    </Popover>
  );
}
