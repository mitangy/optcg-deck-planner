import { createContext, type MouseEvent, type ReactNode } from "react";
import { useMediaQuery } from "@optcg/ui/hooks";

/* Wide screens (#1329): from 1600px the planner List tables drop the Alt arts column. Each card with alts gets
   a second table row under its numbers, holding its alt tiles side by side in a tray. Keep this breakpoint in
   step with wideLayout.css. */
export const WIDE_ALT_STRIP_QUERY = "(min-width: 1600px)";

/** True when the List tables use the wide layout (one tbody per card, alt tiles in a strip row). */
export function useWideListRows(): boolean {
  return useMediaQuery(WIDE_ALT_STRIP_QUERY);
}

/** True inside a strip row: AltArtsRow then wraps its tiles in the tray and labels it "Alt arts · N". */
export const AltTrayContext = createContext(false);

/** The second row of a card: one cell across every value column, holding the alt tiles' tray. */
export function AltStripRow({
  colSpan,
  className,
  onClick,
  children,
}: {
  colSpan: number;
  className?: string;
  onClick?: (e: MouseEvent) => void;
  children: ReactNode;
}) {
  return (
    <tr className={`alt-strip-row${className ? ` ${className}` : ""}`}>
      <td className="alt-strip-cell" colSpan={colSpan} onClick={onClick}>
        <AltTrayContext.Provider value={true}>{children}</AltTrayContext.Provider>
      </td>
    </tr>
  );
}

/** The table's rows: one shared tbody normally, or just the rows (each card brings its own tbody) in the wide layout. */
export function CardBodies({ wide, children }: { wide: boolean; children: ReactNode }) {
  return wide ? <>{children}</> : <tbody>{children}</tbody>;
}
