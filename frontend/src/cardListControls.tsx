import type { ReactNode } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

export const CARD_SORTS_KEY = "optcg_card_sorts";
export const FILTERS_OPEN_KEY = "optcg_filters_open";
export const SHOW_ALT_ARTS_KEY = "optcg_show_alt_arts";

export const COLOR_ORDER = ["Red", "Green", "Blue", "Purple", "Black", "Yellow"];
const SET_PREFIX_ORDER = ["OP", "ST", "EB", "PRB", "P"];

export type SortKey = "still_need" | "color" | "set" | "deck" | "user" | "price";

export const ALL_SORT_KEYS: SortKey[] = ["deck", "user", "still_need", "price", "color", "set"];
export const DEFAULT_SORTS: SortKey[] = ["color", "set"];
export const SORT_LABELS: Record<SortKey, string> = {
  deck: "Deck",
  user: "User",
  still_need: "Still need",
  price: "Price",
  color: "Color",
  set: "Set",
};

export type SortableCard = {
  card_id: string;
  color: string;
  still_need: number;
  deck_sort_key?: string;
  user_sort_key?: string;
  market_price?: number | null;
};

function colorSortKey(color: string): string {
  const parts = color
    .split(/[\/,&]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return "zzz";
  return parts
    .map((p) => {
      const idx = COLOR_ORDER.findIndex((c) => c.toLowerCase() === p.toLowerCase());
      return idx >= 0 ? String(idx).padStart(2, "0") : `9${p.toLowerCase()}`;
    })
    .join("/");
}

function setSortKey(cardId: string): string {
  const id = cardId.toUpperCase();
  const dash = id.indexOf("-");
  const setCode = dash >= 0 ? id.slice(0, dash) : id;
  const m = setCode.match(/^([A-Z]+?)(\d*)$/);
  const prefix = m?.[1] ?? setCode;
  const num = m?.[2] ? Number(m[2]) : 0;
  const prefixIdx = SET_PREFIX_ORDER.indexOf(prefix);
  const prefixRank = prefixIdx >= 0 ? String(prefixIdx).padStart(2, "0") : `9${prefix}`;
  return `${prefixRank}-${String(num).padStart(4, "0")}-${setCode}`;
}

function compareBySortKey(a: SortableCard, b: SortableCard, key: SortKey): number {
  if (key === "still_need") return b.still_need - a.still_need;
  if (key === "color") return colorSortKey(a.color).localeCompare(colorSortKey(b.color));
  if (key === "deck") {
    return (a.deck_sort_key || "zzzz").localeCompare(b.deck_sort_key || "zzzz");
  }
  if (key === "user") {
    return (a.user_sort_key || "zzzz").localeCompare(b.user_sort_key || "zzzz");
  }
  if (key === "price") {
    const ap = a.market_price;
    const bp = b.market_price;
    if (ap == null && bp == null) return 0;
    if (ap == null) return 1;
    if (bp == null) return -1;
    return bp - ap;
  }
  return setSortKey(a.card_id).localeCompare(setSortKey(b.card_id));
}

export function compareCardOrder(a: SortableCard, b: SortableCard, sorts: SortKey[]): number {
  for (const key of sorts) {
    const cmp = compareBySortKey(a, b, key);
    if (cmp !== 0) return cmp;
  }
  return a.card_id.localeCompare(b.card_id);
}

function loadCardSorts(): SortKey[] {
  try {
    const raw = localStorage.getItem(CARD_SORTS_KEY);
    if (!raw) return DEFAULT_SORTS;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_SORTS;
    const valid = parsed.filter((k): k is SortKey => ALL_SORT_KEYS.includes(k as SortKey));
    return valid.length ? valid : DEFAULT_SORTS;
  } catch {
    return DEFAULT_SORTS;
  }
}

export function useCardSorts(onlyNeed: boolean, unavailableKeys: SortKey[] = []) {
  const [sorts, setSorts] = useState<SortKey[]>(() => loadCardSorts());

  useEffect(() => {
    if (!onlyNeed) return;
    setSorts((prev) => (prev.includes("still_need") ? prev.filter((k) => k !== "still_need") : prev));
  }, [onlyNeed]);

  useEffect(() => {
    try {
      localStorage.setItem(CARD_SORTS_KEY, JSON.stringify(sorts));
    } catch {
      /* ignore */
    }
  }, [sorts]);

  const effectiveSorts = useMemo(
    () =>
      sorts.filter((k) => {
        if (k === "still_need" && onlyNeed) return false;
        if (unavailableKeys.includes(k)) return false;
        return true;
      }),
    [onlyNeed, sorts, unavailableKeys],
  );

  return { sorts, setSorts, effectiveSorts };
}

export function SortMenu({
  sorts,
  onChange,
  onlyNeed,
  unavailableKeys = [],
}: {
  sorts: SortKey[];
  onChange: (next: SortKey[]) => void;
  onlyNeed: boolean;
  unavailableKeys?: SortKey[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const menuKeys = useMemo(() => {
    const inactive = ALL_SORT_KEYS.filter((k) => !sorts.includes(k));
    return [...sorts, ...inactive];
  }, [sorts]);

  const summary =
    sorts.filter((k) => !unavailableKeys.includes(k) && !(k === "still_need" && onlyNeed)).length === 0
      ? "Card ID"
      : sorts
          .filter((k) => !unavailableKeys.includes(k) && !(k === "still_need" && onlyNeed))
          .map((k) => SORT_LABELS[k])
          .join(" › ");

  function keyDisabled(key: SortKey): string | null {
    if (key === "still_need" && onlyNeed) return "Off while Still need only";
    if (unavailableKeys.includes(key)) {
      if (key === "deck") return "Shopping list only";
      if (key === "user") return "Group buy only";
      return "Unavailable here";
    }
    return null;
  }

  function toggleKey(key: SortKey) {
    if (keyDisabled(key)) return;
    if (sorts.includes(key)) {
      onChange(sorts.filter((k) => k !== key));
      return;
    }
    onChange([...sorts, key]);
  }

  function moveKey(key: SortKey, dir: -1 | 1) {
    const idx = sorts.indexOf(key);
    if (idx < 0) return;
    const next = idx + dir;
    if (next < 0 || next >= sorts.length) return;
    const copy = [...sorts];
    [copy[idx], copy[next]] = [copy[next], copy[idx]];
    onChange(copy);
  }

  return (
    <div className="sort-menu" ref={rootRef}>
      <button
        type="button"
        className="sort-menu-btn"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
      >
        Sort: {summary}
      </button>
      {open && (
        <div className="sort-menu-panel" role="menu">
          <p className="sort-menu-hint">
            Top option sorts first. Price is highest market price first. Deck groups by leader
            (earliest deck first); cards used by multiple leaders stay under their earliest leader.
            User groups by who wants the card (member list order); multi-buyer cards stay under
            their earliest member.
          </p>
          <ul className="sort-menu-list">
            {menuKeys.map((key) => {
              const active = sorts.includes(key);
              const disabledReason = keyDisabled(key);
              const disabled = Boolean(disabledReason);
              const activeIdx = sorts.indexOf(key);
              return (
                <li key={key} className={`sort-menu-item${disabled ? " disabled" : ""}`}>
                  <label>
                    <input
                      type="checkbox"
                      checked={active && !disabled}
                      disabled={disabled}
                      onChange={() => toggleKey(key)}
                    />
                    <span>{SORT_LABELS[key]}</span>
                  </label>
                  {disabledReason && <span className="sort-menu-note">{disabledReason}</span>}
                  {active && !disabled && (
                    <span className="sort-menu-move">
                      <button
                        type="button"
                        className="ghost"
                        aria-label={`Move ${SORT_LABELS[key]} up`}
                        disabled={activeIdx <= 0}
                        onClick={() => moveKey(key, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        aria-label={`Move ${SORT_LABELS[key]} down`}
                        disabled={activeIdx >= sorts.length - 1}
                        onClick={() => moveKey(key, 1)}
                      >
                        ↓
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export function matchesCardSearch(
  card: {
    card_id: string;
    name: string;
    color?: string;
    card_type?: string;
    rarity?: string;
    used_in?: string[];
    primary_leader_name?: string | null;
  },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    card.card_id,
    card.name,
    card.color,
    card.card_type,
    card.rarity,
    card.primary_leader_name,
    ...(card.used_in ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return q.split(/\s+/).every((token) => hay.includes(token));
}

export function usePersistedOpen(storageKey: string | undefined, defaultOpen: boolean) {
  const [open, setOpen] = useState(() => {
    if (!storageKey) return defaultOpen;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw === null) return defaultOpen;
      return raw === "1";
    } catch {
      return defaultOpen;
    }
  });
  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, open ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [open, storageKey]);
  return [open, setOpen] as const;
}

export function CollapsibleDrawer({
  label,
  summary,
  storageKey,
  defaultOpen = false,
  children,
}: {
  label: string;
  summary?: string;
  storageKey?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = usePersistedOpen(storageKey, defaultOpen);
  const panelId = useId();

  return (
    <div className={`filter-drawer${open ? " open" : ""}`}>
      <button
        type="button"
        className="filter-drawer-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="filter-drawer-label">
          {label}
          {summary ? <span className="filter-drawer-summary"> · {summary}</span> : null}
        </span>
        <span className="filter-drawer-chevron" aria-hidden="true">
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open ? (
        <div id={panelId} className="filter-drawer-body">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function CollapsibleFilters({
  summary,
  children,
}: {
  summary?: string;
  children: ReactNode;
}) {
  return (
    <CollapsibleDrawer label="Filters" summary={summary} storageKey={FILTERS_OPEN_KEY}>
      {children}
    </CollapsibleDrawer>
  );
}

export function CardSearchInput({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const id = useId();
  return (
    <div className="card-search">
      <label className="sr-only" htmlFor={id}>
        Search cards
      </label>
      <input
        id={id}
        type="search"
        className="card-search-input"
        placeholder="Search name, ID, color…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        enterKeyHint="search"
      />
      {value ? (
        <button
          type="button"
          className="ghost card-search-clear"
          onClick={() => onChange("")}
          aria-label="Clear search"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}

export function useShowAltArts() {
  const [showAltArts, setShowAltArts] = useState(() => {
    try {
      return localStorage.getItem(SHOW_ALT_ARTS_KEY) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(SHOW_ALT_ARTS_KEY, showAltArts ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [showAltArts]);
  return [showAltArts, setShowAltArts] as const;
}

/** Build the Filters drawer summary chips used on shopping / deck / group buy. */
export function buildFilterSummary(parts: {
  onlyNeed?: boolean;
  sorts: SortKey[];
  showAltArts?: boolean;
  layout?: "list" | "grid";
  extra?: string[];
}): string {
  const out: string[] = [];
  if (parts.onlyNeed) out.push("Still need");
  if (parts.sorts.length) out.push(parts.sorts.map((k) => SORT_LABELS[k]).join(" › "));
  if (parts.showAltArts) out.push("Alt arts");
  if (parts.layout === "grid") out.push("Grid");
  if (parts.extra?.length) out.push(...parts.extra);
  return out.join(" · ");
}
