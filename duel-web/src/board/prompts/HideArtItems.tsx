import { MenuItem } from "@optcg/ui/popups";
import type { Seat } from "../../net/protocol";

export type ArtToggle = { seat: Seat; name: string | null; hidden: boolean };

export function hideArtLabel(t: ArtToggle): string {
  const who = t.name ? `${t.name}'s` : "opponent's";
  return `${t.hidden ? "Show" : "Hide"} ${who} art`;
}

export function HideArtItems({ toggles, onToggle }: { toggles: ArtToggle[]; onToggle: (seat: Seat) => void }) {
  return (
    <>
      {toggles.map((t) => (
        <MenuItem key={t.seat}>
          <button
            type="button"
            className="match-menu-item"
            aria-pressed={t.hidden}
            title="Replace their custom playmat and card back with the standard art, for this match only"
            onClick={() => onToggle(t.seat)}
          >
            {hideArtLabel(t)}
          </button>
        </MenuItem>
      ))}
    </>
  );
}
