import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { money } from "../api";
import { CardSearchInput, matchesCardSearch } from "../cardListControls";
import { friendsApi, type FriendDeckCard } from "./friendsApi";
import { CardRow, Empty, LoadError } from "./ui";
import { useFriend } from "./useFriend";

/** Order: leader first, then by cost, then name. */
function deckOrder(a: FriendDeckCard, b: FriendDeckCard): number {
  const leader = (c: FriendDeckCard) => (c.card_type.toLowerCase() === "leader" ? 0 : 1);
  const cost = (c: FriendDeckCard) => (c.cost == null || c.cost === "" ? 99 : Number(c.cost));
  return leader(a) - leader(b) || cost(a) - cost(b) || a.name.localeCompare(b.name) || a.card_id.localeCompare(b.card_id);
}

export function FriendDeckPage() {
  const { username, deckId } = useParams();
  const id = Number(deckId);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { friend, isLoading: listLoading } = useFriend(username);
  const deck = useQuery({
    queryKey: ["friend", friend?.user_id, "deck", id],
    queryFn: () => friendsApi.deck(friend!.user_id, id),
    enabled: Boolean(friend) && Number.isFinite(id),
    retry: false,
  });
  const [search, setSearch] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);
  const cards = useMemo(
    () => [...(deck.data?.cards ?? [])].filter((c) => (!missingOnly || c.my_still_need > 0) && matchesCardSearch(c, search)).sort(deckOrder),
    [deck.data, search, missingOnly],
  );
  const copy = useMutation({
    mutationFn: () => friendsApi.copyDeck(friend!.user_id, id),
    onSuccess: (created) => {
      void qc.invalidateQueries({ queryKey: ["decks"] });
      void qc.invalidateQueries({ queryKey: ["shopping"] });
      navigate(`/decks/${created.id}`);
    },
  });

  if (listLoading || (deck.isLoading && friend)) return <p className="muted friends-loading">Loading…</p>;
  if (!friend || deck.isError) {
    return (
      <section className="friends-page">
        <Empty title="Not found">That deck isn't shared with you.</Empty>
        <p className="friend-back">
          <Link to={friend ? `/friends/${encodeURIComponent(friend.username)}` : "/friends"}>Back</Link>
        </p>
      </section>
    );
  }
  const d = deck.data!;
  const unique = d.cards.length;

  return (
    <section className="friends-page friend-deck-page">
      <p className="friend-back">
        <Link to={`/friends/${encodeURIComponent(friend.username)}`}>← {friend.username}</Link>
      </p>
      <div className="page-head">
        <div>
          <h1>{d.name}</h1>
          <p className="muted">
            Deck by {friend.username} · {d.leader_name || d.leader_card_id || "No leader"} · {d.main_cards} main cards · {unique} different
          </p>
        </div>
        <div className="page-head-actions">
          <button type="button" className="btn primary" disabled={copy.isPending} onClick={() => copy.mutate()}>
            Copy to my decks
          </button>
        </div>
      </div>
      {copy.isError && <LoadError error={copy.error} />}
      <section className="friend-card need-summary" aria-label="What I'd need">
        <h2>What I'd need</h2>
        {d.my_missing_copies === 0 ? (
          <p>You own every card in this deck.</p>
        ) : (
          <p>
            You're missing <strong>{d.my_missing_copies}</strong> card{d.my_missing_copies === 1 ? "" : "s"}
            {d.my_missing_cost != null ? (
              <>
                , about <strong>{money(d.my_missing_cost)}</strong> at market price.
              </>
            ) : (
              ". Some of them have no price yet."
            )}
          </p>
        )}
      </section>
      <div className="friend-toolbar">
        <CardSearchInput value={search} onChange={setSearch} />
        <label className="friend-check">
          <input type="checkbox" checked={missingOnly} onChange={(e) => setMissingOnly(e.target.checked)} />
          Only cards I'm missing
        </label>
      </div>
      {cards.length === 0 ? (
        <Empty title="No matches">Try a different search.</Empty>
      ) : (
        <ul className="friend-card-list">
          {cards.map((c) => (
            <CardRow
              key={c.card_id}
              cardId={c.card_id}
              name={c.name}
              imageUrl={c.image_url}
              className={c.my_still_need > 0 ? "missing" : "covered"}
              meta={[c.rarity, c.market_price != null ? money(c.market_price) : null].filter(Boolean).join(" · ")}
            >
              <span className="deck-need">
                <span className="deck-need-qty">×{c.needed}</span>
                <span className={`deck-need-own ${c.my_still_need > 0 ? "short" : "ok"}`}>
                  {c.my_still_need > 0 ? `Need ${c.my_still_need} more` : "You have it"}
                  {c.my_owned > 0 && c.my_still_need > 0 ? ` (own ${c.my_owned})` : ""}
                </span>
              </span>
            </CardRow>
          ))}
        </ul>
      )}
    </section>
  );
}
