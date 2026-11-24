import { useContext, type ReactNode } from "react";
import { SourceHooksContext } from "./Sources";

/** A card's small art. When the app can show a card enlarged (`hooks.openCard`) it is a button that does; otherwise it is plain art. */
export function CardThumbButton({ id, name, className, children }: { id: string; name: string; className: string; children: ReactNode }) {
  const { openCard } = useContext(SourceHooksContext);
  if (!openCard) {
    return (
      <span className={className} aria-hidden="true">
        {children}
      </span>
    );
  }
  return (
    <button type="button" className={`${className} lp-thumb-btn`} aria-label={`Enlarge ${name}`} onClick={() => openCard(id)}>
      {children}
    </button>
  );
}
