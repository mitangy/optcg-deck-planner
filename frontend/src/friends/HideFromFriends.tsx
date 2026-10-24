import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { DeckDetail } from "../api";
import { friendsApi } from "./friendsApi";

/** Deck editor "More" menu row: keep this deck off your friends' view of your decks. */
export function HideFromFriendsItem({ deck, onUpdated, close }: { deck: DeckDetail; onUpdated: (d: DeckDetail) => void; close: () => void }) {
  const qc = useQueryClient();
  const hidden = Boolean(deck.hidden_from_friends);
  const toggle = useMutation({
    mutationFn: () => friendsApi.setDeckHidden(deck.id, !hidden),
    onSuccess: (detail) => {
      onUpdated(detail);
      void qc.invalidateQueries({ queryKey: ["decks"] });
      void qc.invalidateQueries({ queryKey: ["friend"] });
    },
  });
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={hidden}
      disabled={toggle.isPending}
      onClick={() => {
        toggle.mutate();
        close();
      }}
    >
      {hidden ? "Hidden from friends" : "Hide from friends"}
      <span className="muted">{hidden ? "Friends can't see this deck. Tap to show it again" : "Friends can see your decks unless you hide this one"}</span>
    </button>
  );
}
