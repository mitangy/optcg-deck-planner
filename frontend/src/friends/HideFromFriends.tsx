import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MenuItem } from "@optcg/ui/popups";
import type { DeckDetail } from "../api";
import { friendsApi } from "./friendsApi";

/** Deck editor "More" menu row (a `MenuItem`): keep this deck off your friends' view of your decks. The label says which way it is set. */
export function HideFromFriendsItem({ deck, onUpdated }: { deck: DeckDetail; onUpdated: (d: DeckDetail) => void }) {
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
    <MenuItem disabled={toggle.isPending}>
      <button type="button" onClick={() => toggle.mutate()}>
        {hidden ? "Hidden from friends" : "Hide from friends"}
        <span className="muted">{hidden ? "Friends can't see this deck. Tap to show it again" : "Friends can see your decks unless you hide this one"}</span>
      </button>
    </MenuItem>
  );
}
