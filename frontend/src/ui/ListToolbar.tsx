import { useId, useState, type ReactNode } from "react";
import { useMediaQuery } from "@optcg/ui/hooks";
import { CardSearchInput, SortMenu } from "./cardListControls";
import { CardLayoutToggle, DensityToggle, type CardLayout, type ListDensity } from "./CardLayout";
import { CollectionFilterMenu, ColorFilterChips, TypeFilterChips } from "./CollectionToolbar";

/** Phones and short landscape screens: colour dots and type chips share one row that scrolls sideways. */
export const CHIP_SCROLL_QUERY = "(max-width: 640px), (max-height: 500px) and (orientation: landscape)";

type SortMenuProps = Parameters<typeof SortMenu>[0];

/**
 * The one toolbar every card list uses (Shopping, deck, Collection, share page):
 * search, colour dots, type pills, Sort, Filters, List/Grid (+ density) and page extras.
 * Page-specific options go into the Filters popover as `filters`.
 */
export function ListToolbar({
  className = "",
  search,
  colors,
  types,
  sort,
  filters,
  filterBadge = 0,
  filterLabel = "Filters",
  layout,
  onLayout,
  density,
  onDensity,
  extras,
}: {
  className?: string;
  search: { value: string; onChange: (next: string) => void; placeholder?: string; label?: string; icon?: boolean | "search" | "filter" };
  colors?: { selected: string[]; onToggle: (color: string) => void; onClear: () => void };
  types?: { types: string[]; value: string; onChange: (type: string) => void };
  sort: SortMenuProps;
  filters: ReactNode;
  filterBadge?: number;
  filterLabel?: string;
  layout: CardLayout;
  onLayout: (next: CardLayout) => void;
  density?: ListDensity;
  onDensity?: (next: ListDensity) => void;
  extras?: ReactNode;
}) {
  const chipScroll = useMediaQuery(CHIP_SCROLL_QUERY);
  const colorChips = colors ? <ColorFilterChips selected={colors.selected} onToggle={colors.onToggle} onClear={colors.onClear} /> : null;
  const typeChips = types && types.types.length > 0 ? <TypeFilterChips {...types} /> : null;
  const oneRow = !colorChips && !typeChips;
  const tools = (
    <div className="collection-toolbar-tools">
      <SortMenu {...sort} />
      <CollectionFilterMenu badge={filterBadge} label={filterLabel}>
        {filters}
      </CollectionFilterMenu>
      <CardLayoutToggle layout={layout} onChange={onLayout} icons />
      {/* Kept (just hidden) in Grid, so switching layouts never moves the List/Grid switch. */}
      {density && onDensity ? <DensityToggle density={density} onChange={onDensity} hidden={layout !== "list"} /> : null}
    </div>
  );
  return (
    <div className={`list-toolbar collection-toolbar${chipScroll ? " chips-scroll" : ""}${className ? ` ${className}` : ""}`}>
      <div className="collection-toolbar-row">
        <CardSearchInput icon="search" {...search} />
        {extras}
        {chipScroll ? null : colorChips}
        {/* No colour or type chips (the deck page): search and the tools share one row. */}
        {oneRow ? tools : null}
      </div>
      {chipScroll ? (
        (colorChips || typeChips) && (
          <div className="collection-toolbar-row toolbar-chip-scroll">
            {colorChips}
            {typeChips}
          </div>
        )
      ) : null}
      {oneRow ? null : (
        <div className="collection-toolbar-row">
          {chipScroll ? null : (typeChips ?? <span />)}
          {tools}
        </div>
      )}
    </div>
  );
}

/** A filter checkbox row inside the Filters popover. */
export function FilterCheck({ checked, onChange, children }: { checked: boolean; onChange: (next: boolean) => void; children: ReactNode }) {
  return (
    <label>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

/** A heading with a small "?" button that opens an explanation under it, instead of a permanent paragraph. */
export function HintHeading({ title, titleId, label, children }: { title: ReactNode; titleId?: string; label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <div className="hint-head">
        <span id={titleId}>{title}</span>
        <button type="button" className="hint-toggle" aria-label={label} aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
          ?
        </button>
      </div>
      {open ? (
        <p id={id} className="need-mode-note muted">
          {children}
        </p>
      ) : null}
    </>
  );
}
