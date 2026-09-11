import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { lookupCard } from "../cards/atlas";
import { resolveCardImageUrl } from "../decks/artPrefs";
import { groupDeckStacks } from "../decks/groupStacks";
import {
  getSavedDeck,
  setDeckArtPref,
  setSelectedDeckId,
  type SavedDeck,
} from "../decks/storage";

function StackCard({
  deck,
  defId,
  count,
  onArtChange,
}: {
  deck: SavedDeck;
  defId: string;
  count: number;
  onArtChange: () => void;
}) {
  const entry = lookupCard(defId);
  const imageUrl = resolveCardImageUrl(defId, deck) ?? entry.imageUrl;
  const alts = entry.altArts ?? [];
  const selectedAlt = deck.artPrefs?.[defId] ?? "";

  return (
    <article className="deck-stack">
      <div className="deck-stack-art">
        {imageUrl ? (
          <img src={imageUrl} alt={entry.name} className="deck-stack-img" />
        ) : (
          <div className="deck-stack-fallback">{defId}</div>
        )}
        <span className="deck-stack-badge" aria-label={`${count} copies`}>
          ×{count}
        </span>
      </div>
      <div className="deck-stack-meta">
        <div className="deck-stack-name">{entry.name}</div>
        <div className="deck-stack-id">{defId}</div>
        {alts.length > 0 ? (
          <label className="deck-stack-art-label">
            Artwork
            <select
              className="deck-stack-art-select"
              value={selectedAlt}
              onChange={(e) => {
                const value = e.target.value;
                setDeckArtPref(deck.id, defId, value || null);
                onArtChange();
              }}
            >
              <option value="">Standard</option>
              {alts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="meta">No alt arts in atlas</p>
        )}
      </div>
    </article>
  );
}

export function DeckConfigurePage() {
  const { deckId } = useParams<{ deckId: string }>();
  const [artTick, setArtTick] = useState(0);

  const deck = useMemo(() => {
    void artTick;
    return deckId ? getSavedDeck(deckId) : undefined;
  }, [deckId, artTick]);

  useEffect(() => {
    if (deck) setSelectedDeckId(deck.id);
  }, [deck]);

  const stacks = useMemo(
    () => (deck ? groupDeckStacks(deck.leaderId, deck.cards) : null),
    [deck],
  );

  if (!deckId || !deck || !stacks) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="app-shell">
      <div className="deck-config">
        <header className="deck-config-header">
          <Link to="/" className="btn btn-secondary deck-config-back">
            ← Lobby
          </Link>
          <div>
            <h1 className="deck-config-title">Configure deck</h1>
            <p className="meta">
              {deck.name} · leader {deck.leaderId} · {deck.cards.length} main
            </p>
          </div>
        </header>

        <section className="deck-config-section">
          <h2 className="lobby-section-title">Leader</h2>
          <div className="deck-stack-grid">
            <StackCard
              deck={deck}
              defId={stacks.leader.defId}
              count={stacks.leader.count}
              onArtChange={() => setArtTick((n) => n + 1)}
            />
          </div>
        </section>

        <section className="deck-config-section">
          <h2 className="lobby-section-title">
            Main deck ({stacks.main.length} unique)
          </h2>
          <div className="deck-stack-grid">
            {stacks.main.map((s) => (
              <StackCard
                key={s.defId}
                deck={deck}
                defId={s.defId}
                count={s.count}
                onArtChange={() => setArtTick((n) => n + 1)}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
