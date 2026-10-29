import { MenuItem } from "@optcg/ui/popups";
import type { Seat } from "../net/protocol";

/** One seat whose custom playmat / card back can be hidden for the rest of this match (#812). */
export type ArtToggle = { seat: Seat; name: string | null; hidden: boolean };

/** "Hide Zoro's art" / "Show Zoro's art"; "opponent" when the seat has no name. */
export function hideArtLabel(t: ArtToggle): string {
  const who = t.name ? `${t.name}'s` : "opponent's";
  return `${t.hidden ? "Show" : "Hide"} ${who} art`;
}

/**
 * Match-menu rows that hide (or bring back) a player's custom playmat and card
 * back. In memory for this match only; the caller owns the state.
 */
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
