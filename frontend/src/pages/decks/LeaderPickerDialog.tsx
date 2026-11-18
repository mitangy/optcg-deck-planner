import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type CatalogCardResult } from "../../api";
import { qk } from "../../cache/queryKeys";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { CATALOG_SEARCH_DEBOUNCE_MS } from "../../hooks/useCatalogSearch";
import { CardThumb } from "../../ui/CardThumb";
import { CardSearchInput } from "../../ui/cardListControls";
import { InlineSkeleton } from "../../ui/Skeleton";
import { Dialog, DialogTitle } from "@optcg/ui/popups";

/** A deck that holds just the leader, ready to fill in edit mode. */
export function leaderOnlyDecklist(cardId: string): string {
  return `1x${cardId}`;
}

export function LeaderPickerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const q = useDebouncedValue(query, CATALOG_SEARCH_DEBOUNCE_MS).trim();

  useEffect(() => {
    if (open) {
      setQuery("");
      setErr(null);
    }
  }, [open]);

  const leaders = useQuery({
    queryKey: qk.catalogSearch.query(q, "", "Leader", false),
    queryFn: () => api.searchCatalog({ q: q || undefined, card_type: "Leader", limit: 40 }),
    enabled: open,
  });
  const create = useMutation({
    mutationFn: (leader: CatalogCardResult) => api.createDeck(leader.name, leaderOnlyDecklist(leader.card_id)),
    onSuccess: async (deck) => {
      await qc.invalidateQueries({ queryKey: qk.decks() });
      await qc.invalidateQueries({ queryKey: qk.shopping.all() });
      onClose();
      navigate(`/decks/${deck.id}?edit=1`);
    },
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!create.isPending) onClose();
      }}
      className="replace-deck-backdrop"
      panelClassName="import-form replace-deck-dialog leader-picker"
    >
      <DialogTitle as="h2" className="replace-deck-title">
        Pick a Leader
      </DialogTitle>
      <p className="muted">Your new deck starts with this Leader. Add the other cards next.</p>
      <CardSearchInput value={query} onChange={setQuery} label="Search Leaders" placeholder="Name or ID, e.g. Nami or OP11-041" />
      {err && (
        <p className="error" role="alert">
          {err}
        </p>
      )}
      <div className="leader-picker-results">
        {leaders.isLoading && <InlineSkeleton lines={3} label="Searching Leaders…" />}
        {leaders.error && <p className="error">{(leaders.error as Error).message}</p>}
        {leaders.data && leaders.data.length === 0 && <p className="muted">No Leaders match.</p>}
        {leaders.data && leaders.data.length > 0 && (
          <ul className="deck-editor-results">
            {leaders.data.map((card) => (
              <li key={card.card_id} className="deck-editor-result" data-catalog-id={card.card_id}>
                <div className="deck-editor-result-main">
                  <CardThumb src={card.image_url || undefined} cardId={card.card_id} alt={card.name} />
                  <div>
                    <div className="card-id">{card.card_id}</div>
                    <div>{card.name}</div>
                    <div className="muted">{[card.color, card.rarity].filter(Boolean).join(" · ") || "—"}</div>
                  </div>
                </div>
                <div className="deck-editor-result-actions">
                  <button type="button" className="btn secondary" disabled={create.isPending} onClick={() => create.mutate(card)}>
                    Start deck
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="replace-deck-actions">
        <button type="button" className="btn secondary" onClick={onClose} disabled={create.isPending}>
          Cancel
        </button>
      </div>
    </Dialog>
  );
}
