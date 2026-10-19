import { useCallback, useSyncExternalStore } from "react";

export type SortDir = "asc" | "desc";
export type ColumnSort = { key: string; dir: SortDir } | null;
export type ColumnValue = number | string | null | undefined;

/** A card's play cost can be a number or text ("-"); numbers sort first, text after. */
export function costSortValue(cost: number | string | null | undefined): ColumnValue {
  if (cost === null || cost === undefined || cost === "") return null;
  const n = Number(cost);
  return Number.isFinite(n) ? n : String(cost);
}

/**
 * Header-click cycle: a new column starts in `firstDir`, a second click on it
 * reverses, a third clears the column sort (back to the page's Sort-menu order).
 */
export function nextColumnSort(current: ColumnSort, key: string, firstDir: SortDir): ColumnSort {
  if (!current || current.key !== key) return { key, dir: firstDir };
  if (current.dir === firstDir) return { key, dir: firstDir === "asc" ? "desc" : "asc" };
  return null;
}

const isEmpty = (v: ColumnValue): v is null | undefined | "" => v === null || v === undefined || v === "";

function compareValues(a: number | string, b: number | string): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a !== typeof b) return typeof a === "number" ? -1 : 1;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Sorts a copy of `rows` by one column. Stable: ties keep the incoming order
 * (the Sort-menu order the page already applied). Empty values always go last,
 * whichever direction is active.
 */
export function sortByColumn<T>(rows: T[], sort: ColumnSort, getValue: (row: T, key: string) => ColumnValue): T[] {
  if (!sort) return rows;
  const sign = sort.dir === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: getValue(row, sort.key) }))
    .sort((a, b) => {
      const aEmpty = isEmpty(a.value);
      const bEmpty = isEmpty(b.value);
      if (aEmpty || bEmpty) return aEmpty === bEmpty ? a.index - b.index : aEmpty ? 1 : -1;
      const cmp = compareValues(a.value as number | string, b.value as number | string);
      return cmp !== 0 ? sign * cmp : a.index - b.index;
    })
    .map((entry) => entry.row);
}

function loadColumnSort(storageKey: string): ColumnSort {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { key?: unknown; dir?: unknown } | null;
    if (parsed && typeof parsed.key === "string" && (parsed.dir === "asc" || parsed.dir === "desc")) {
      return { key: parsed.key, dir: parsed.dir };
    }
  } catch {
    /* ignore */
  }
  return null;
}

// One value per storage key, shared by every table using it (the deck page and
// Master Shopping render several tables that should follow the same header sort).
const stores = new Map<string, ColumnSort>();
const listeners = new Set<() => void>();

function readStore(storageKey: string): ColumnSort {
  if (!stores.has(storageKey)) stores.set(storageKey, loadColumnSort(storageKey));
  return stores.get(storageKey) ?? null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Column sort for a table, remembered per browser under `storageKey`. */
export function useColumnSort(storageKey: string) {
  const sort = useSyncExternalStore(subscribe, () => readStore(storageKey));
  const onSort = useCallback(
    (key: string, firstDir: SortDir) => {
      const next = nextColumnSort(readStore(storageKey), key, firstDir);
      stores.set(storageKey, next);
      try {
        if (next) localStorage.setItem(storageKey, JSON.stringify(next));
        else localStorage.removeItem(storageKey);
      } catch {
        /* ignore */
      }
      listeners.forEach((l) => l());
    },
    [storageKey],
  );
  return { sort, onSort };
}

export function SortableTh({
  label,
  colKey,
  sort,
  onSort,
  firstDir,
  className,
  title,
}: {
  label: string;
  colKey: string;
  sort: ColumnSort;
  onSort: (key: string, firstDir: SortDir) => void;
  firstDir: SortDir;
  className?: string;
  title?: string;
}) {
  const active = sort?.key === colKey ? sort.dir : null;
  return (
    <th
      className={className}
      title={title}
      scope="col"
      aria-sort={active === "asc" ? "ascending" : active === "desc" ? "descending" : "none"}
    >
      <button type="button" className="th-sort-btn" aria-label={`Sort by ${label}`} onClick={() => onSort(colKey, firstDir)}>
        <span className="th-sort-label">{label}</span>
        <span className={`th-sort-arrow${active ? " active" : ""}`} aria-hidden="true">
          {/* Fixed 6x9 icon: up and down carets, the inactive one faded. */}
          <svg width="6" height="9" viewBox="0 0 7 10" focusable="false">
            <path d="M3.5 0 7 4H0z" opacity={active === "desc" ? 0.25 : 1} />
            <path d="M3.5 10 0 6h7z" opacity={active === "asc" ? 0.25 : 1} />
          </svg>
        </span>
      </button>
    </th>
  );
}
