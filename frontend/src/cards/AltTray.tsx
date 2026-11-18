import { createContext, type MouseEvent, type ReactNode } from "react";
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

export const AltTrayContext = createContext(false);

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

export function CardBodies({ wide, children }: { wide: boolean; children: ReactNode }) {
  return wide ? <>{children}</> : <tbody>{children}</tbody>;
}
