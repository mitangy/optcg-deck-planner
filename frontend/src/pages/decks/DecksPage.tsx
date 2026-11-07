import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, DeckSummary } from "../../api";
import { savedShoppingDeckIds } from "../../shoppingDeckFilter";
import { invalidateOwnedViews } from "../../ownedCollection";
import { CompassIcon } from "../../ThemeIcons";
import { CardArtImg } from "../../CardThumb";
import { DecksListSkeleton } from "../../Skeleton";

type DeckLeaderGroup = {
  key: string;
  leaderCardId: string | null;
  leaderName: string | null;
  leaderImageUrl: string;
  decks: DeckSummary[];
};

function groupDecksByLeader(
  decks: DeckSummary[],
  artFallback: Map<string, { name: string; image_url: string }>,
): DeckLeaderGroup[] {
  const groups: DeckLeaderGroup[] = [];
  const indexByKey = new Map<string, number>();
  for (const deck of decks) {
    const key = deck.leader_card_id || "__none__";
    let idx = indexByKey.get(key);
    if (idx == null) {
      const fallback = deck.leader_card_id ? artFallback.get(deck.leader_card_id) : undefined;
      idx = groups.length;
      indexByKey.set(key, idx);
      groups.push({
        key,
        leaderCardId: deck.leader_card_id,
        leaderName: deck.leader_name || fallback?.name || null,
        leaderImageUrl: deck.leader_image_url || fallback?.image_url || "",
        decks: [],
      });
    }
    groups[idx].decks.push(deck);
  }
  for (const group of groups) {
    group.decks.sort((a, b) => {
      if (Boolean(a.is_main) !== Boolean(b.is_main)) return a.is_main ? -1 : 1;
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.id - b.id;
    });
  }
  return groups;
}

/** Compact owned-copies bar for a deck tile; hidden when the API omits the count. */
function DeckOwnedMeter({ owned, total }: { owned: number | undefined; total: number }) {
  if (owned == null || total <= 0) return null;
  const pct = Math.min(100, Math.round((owned / total) * 100));
  const complete = owned >= total;
  return (
    <div className={`deck-owned-meter${complete ? " complete" : ""}`}>
      <div className="deck-owned-meter-text">
        <span>
          <strong>{owned}</strong> / {total} owned
        </span>
        <span>{complete ? "Complete" : `${total - owned} to go`}</span>
      </div>
      <div
        className="deck-progress-bar"
        role="progressbar"
        aria-label="Copies owned"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={owned}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function DecksPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({ queryKey: ["decks"], queryFn: api.decks });
  const needsLeaderArtFallback = useMemo(
    () => (data ?? []).some((d) => Boolean(d.leader_card_id) && !d.leader_image_url),
    [data],
  );
  // Prod API may lag behind the SPA (Render deploy). Fall back to shopping catalog art.
  const leaderArtQ = useQuery({
    queryKey: ["shopping", "leader-art-fallback"],
    queryFn: () => api.shopping(),
    enabled: needsLeaderArtFallback,
    staleTime: 60_000,
  });
  const leaderArtById = useMemo(() => {
    const map = new Map<string, { name: string; image_url: string }>();
    for (const item of leaderArtQ.data?.items ?? []) {
      if (!item.image_url && !item.name) continue;
      map.set(item.card_id, { name: item.name, image_url: item.image_url });
    }
    return map;
  }, [leaderArtQ.data]);
  const leaderGroups = useMemo(
    () => groupDecksByLeader(data ?? [], leaderArtById),
    [data, leaderArtById],
  );
  const del = useMutation({
    mutationFn: api.deleteDeck,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["decks"] });
      invalidateOwnedViews(qc);
    },
  });
  const setMain = useMutation({
    mutationFn: api.setDeckAsMain,
    onSuccess: (detail) => {
      void qc.invalidateQueries({ queryKey: ["decks"] });
      // Cached with the unfiltered response only when Include decks is not narrowed.
      if (!savedShoppingDeckIds(qc.getQueryData<DeckSummary[]>(["decks"])?.map((d) => d.id) ?? [])) {
        qc.setQueryData(["deck", detail.id], detail);
      }
      // Other same-leader decks change which cards are Additional.
      void qc.invalidateQueries({ queryKey: ["deck"] });
    },
  });

  if (isLoading) return <DecksListSkeleton />;
  if (error) return <p className="error">{(error as Error).message}</p>;

  return (
    <section>
      <div className="page-head">
        <h1>Decks</h1>
        <Link className="btn primary" to="/import">
          Import deck
        </Link>
      </div>
      {setMain.isError && (
        <p className="error">{(setMain.error as Error).message}</p>
      )}
      {del.isError && <p className="error">{(del.error as Error).message}</p>}
      {leaderGroups.length === 0 && (
        <div className="empty-state">
          <CompassIcon />
          <h2>No decks aboard yet</h2>
          <p>Import an OPTCGSim deck code and its cards join your Master Shopping list.</p>
          <Link className="btn primary" to="/import">
            Import your first deck
          </Link>
        </div>
      )}
      <div className="deck-leader-groups">
        {leaderGroups.map((group) => {
          const heading = group.leaderCardId
            ? `${group.leaderName || "Leader"} · ${group.leaderCardId}`
            : "No leader detected";
          return (
            <section key={group.key} className="deck-leader-group">
              <header className="deck-leader-group-head">
                {group.leaderCardId ? (
                  <CardArtImg
                    src={group.leaderImageUrl}
                    cardId={group.leaderCardId}
                    alt=""
                    className="deck-leader-group-thumb"
                    loading="lazy"
                    fallback={
                      <div className="thumb placeholder deck-leader-group-thumb" aria-hidden>
                        <span className="deck-card-leader-fallback">{group.leaderCardId}</span>
                      </div>
                    }
                  />
                ) : null}
                <div className="deck-leader-group-title">
                  <h2>{heading}</h2>
                  <p className="muted">
                    {group.decks.length} deck{group.decks.length === 1 ? "" : "s"}
                    {group.decks.some((d) => d.is_main) ? " · Main listed first" : ""}
                  </p>
                </div>
              </header>
              <div className="deck-grid">
                {group.decks.map((d) => {
                  const fallback = d.leader_card_id
                    ? leaderArtById.get(d.leader_card_id)
                    : undefined;
                  const leaderImage = d.leader_image_url || fallback?.image_url || "";
                  const leaderName = d.leader_name || fallback?.name || null;
                  const isMain = Boolean(d.is_main);
                  return (
                    <article
                      key={d.id}
                      className={`deck-card${isMain ? " is-main" : ""}`}
                      role="link"
                      tabIndex={0}
                      onClick={() => navigate(`/decks/${d.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          navigate(`/decks/${d.id}`);
                        }
                      }}
                    >
                      <div className="deck-card-main">
                        {leaderImage || d.leader_card_id ? (
                          <div className="deck-card-leader-art">
                            <CardArtImg
                              src={leaderImage}
                              cardId={d.leader_card_id}
                              alt={leaderName || d.leader_card_id || "Leader"}
                              className="deck-card-leader-thumb"
                              loading="lazy"
                              fallback={
                                <div
                                  className="thumb placeholder deck-card-leader-thumb"
                                  aria-label={d.leader_card_id || "Leader"}
                                >
                                  <span className="deck-card-leader-fallback">
                                    {d.leader_card_id || "?"}
                                  </span>
                                </div>
                              }
                            />
                          </div>
                        ) : null}
                        <div className="deck-card-body">
                          <div className="deck-card-title-row">
                            <h2>{d.name}</h2>
                            {isMain && <span className="deck-main-badge">Main deck</span>}
                          </div>
                          <p className="muted">
                            {d.main_cards ?? d.total_cards}/{51} main
                            {(d.don_cards ?? 0) > 0 ? ` · ${d.don_cards}/10 DON!!` : ""}
                            {` · ${d.card_count} unique`}
                          </p>
                          <DeckOwnedMeter owned={d.owned_copies} total={d.main_cards ?? d.total_cards} />
                        </div>
                      </div>
                      <div className="row-actions">
                        {d.leader_card_id && !isMain && (
                          <button
                            type="button"
                            className="ghost"
                            disabled={setMain.isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              setMain.mutate(d.id);
                            }}
                          >
                            Set as Main
                          </button>
                        )}
                        <button
                          type="button"
                          className="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/decks/${d.id}?edit=1`);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="ghost danger"
                          disabled={del.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!window.confirm(`Delete “${d.name}”? This can’t be undone.`)) return;
                            del.mutate(d.id);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
