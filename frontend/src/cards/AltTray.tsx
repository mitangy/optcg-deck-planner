import { createContext, useCallback, useState, type MouseEvent, type ReactNode } from "react";
import { useMediaQuery } from "@optcg/ui/hooks";

export const WIDE_ALT_STRIP_QUERY = "(min-width: 1600px)";

export function useWideListRows(): boolean {
  return useMediaQuery(WIDE_ALT_STRIP_QUERY);
}

export function wideGridSpan(altArtCount: number): 2 | 3 {
  return altArtCount + 1 >= 5 ? 3 : 2;
}

export function wideGridAlts(bigScreen: boolean, altArtCount: number, shown = true): { wide: boolean; className: string } {
  const wide = bigScreen && shown && altArtCount > 0;
  return { wide, className: wide ? ` alt-wide alt-wide-${wideGridSpan(altArtCount)}` : "" };
}

export function useWideGridAlts(altArtCount: number, shown = true) {
  return wideGridAlts(useWideListRows(), altArtCount, shown);
}

/** On a phone, Grid tiles fold their alt tiles behind the same chip as Compact rows (#1342). */
export function useFoldGridAlts(): boolean {
  return useMediaQuery("(max-width: 800px)");
}

export const AltTrayContext = createContext(false);

type ChipAlt = { wanted?: number; owned?: number; collector?: number };

/** "2 alts" or "2 alts · 1 picked": an alt counts as picked when the user wants, owns or extra-copies it. */
export function altChipLabel(alts: readonly ChipAlt[]): string {
  const picked = alts.filter((a) => (a.wanted ?? 0) > 0 || (a.owned ?? 0) > 0 || (a.collector ?? 0) > 0).length;
  return `${alts.length} ${alts.length === 1 ? "alt" : "alts"}${picked > 0 ? ` · ${picked} picked` : ""}`;
}

/** Which rows of a Compact list have their alt tray open. */
export function useExpandedAlts() {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = useCallback((key: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  return { open, toggle };
}

export const altTrayId = (key: string) => `alt-tray-${key.replace(/[^A-Za-z0-9_-]/g, "_")}`;

/** The one chip that stands in for a row's alt tiles in Compact lists; it opens that row's tray in place. */
export function AltChip({
  alts,
  trayKey,
  expanded,
  onToggle,
  label,
}: {
  alts: readonly ChipAlt[];
  /** Replaces the "N alts · N picked" text (the group buy shows what was bought instead). */
  label?: string;
  trayKey: string;
  expanded: boolean;
  onToggle: (key: string) => void;
}) {
  return (
    <button
      type="button"
      className={`alt-chip${expanded ? " open" : ""}`}
      aria-expanded={expanded}
      aria-controls={altTrayId(trayKey)}
      onKeyDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(trayKey);
      }}
    >
      <span>{label ?? altChipLabel(alts)}</span>
      <span className="alt-chip-chevron" aria-hidden="true">
        {expanded ? "▴" : "▾"}
      </span>
    </button>
  );
}

export function AltStripRow({
  colSpan,
  className,
  id,
  rowId,
  onClick,
  children,
}: {
  colSpan: number;
  className?: string;
  id?: string;
  /** The card this strip belongs to, so it moves and fades with its row (#1498). */
  rowId?: string;
  onClick?: (e: MouseEvent) => void;
  children: ReactNode;
}) {
  return (
    <tr data-row-id={rowId} className={`alt-strip-row${className ? ` ${className}` : ""}`}>
      <td className="alt-strip-cell" id={id} colSpan={colSpan} onClick={onClick}>
        <AltTrayContext.Provider value={true}>{children}</AltTrayContext.Provider>
      </td>
    </tr>
  );
}

export function CardBodies({ wide, children }: { wide: boolean; children: ReactNode }) {
  return wide ? <>{children}</> : <tbody>{children}</tbody>;
}
