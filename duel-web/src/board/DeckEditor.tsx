import { useMemo, useState } from "react";
import { CardInspect } from "./CardInspect";
import { lookupCard } from "../cards/atlas";
import {
  hasActiveCardSearch,
  listAtlasColors,
  listAtlasCounters,
  listAtlasTypes,
  searchAtlas,
} from "../cards/searchAtlas";
import { resolveCardImageUrl } from "../decks/artPrefs";
import {
  addCardToDeck,
  countCardInDeck,
  MAX_COPIES_PER_CARD,
  MAX_MAIN_DECK_SIZE,
  removeAllCopiesFromDeck,
  removeCardFromDeck,
} from "../decks/editDeck";
import { groupDeckStacks } from "../decks/groupStacks";
import {
  getSavedDeck,
  setDeckArtPref,
  type SavedDeck,
} from "../decks/storage";

const ATTRIBUTE_OPTIONS = [
  "Strike",
  "Slash",
  "Ranged",
  "Special",
  "Wisdom",
] as const;

function StackCard({
  deck,
  defId,
  count,
  editable,
  selected,
  onSelect,
  onChanged,
}: {
  deck: SavedDeck;
  defId: string;
  count: number;
  editable: boolean;
  selected: boolean;
  onSelect: () => void;
  onChanged: () => void;
}) {
  const entry = lookupCard(defId);
  const imageUrl = resolveCardImageUrl(defId, deck) ?? entry.imageUrl;
  const alts = entry.altArts ?? [];
  const selectedAlt = deck.artPrefs?.[defId] ?? "";
  const [editError, setEditError] = useState<string | null>(null);

  function bump(delta: -1 | 1) {
    setEditError(null);
    const result =
      delta < 0
        ? removeCardFromDeck(deck.id, defId)
        : addCardToDeck(deck.id, defId);
    if (!result.ok) {
      setEditError(result.error);
      return;
    }
    onChanged();
  }

  function removeAll() {
    setEditError(null);
    const result = removeAllCopiesFromDeck(deck.id, defId);
    if (!result.ok) {
      setEditError(result.error);
      return;
    }
    onChanged();
  }

  return (
    <article
      className={`deck-stack${selected ? " selected" : ""}`}
      data-selected={selected ? "true" : undefined}
    >
      <button
        type="button"
        className="deck-stack-art-btn"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`View details for ${entry.name}`}
      >
        <div className="deck-stack-art">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="deck-stack-img" />
          ) : (
            <div className="deck-stack-fallback">{defId}</div>
          )}
          <span className="deck-stack-badge" aria-label={`${count} copies`}>
            ×{count}
          </span>
        </div>
      </button>
      <div className="deck-stack-meta">
        <button type="button" className="deck-stack-name-btn" onClick={onSelect}>
          <div className="deck-stack-name">{entry.name}</div>
          <div className="deck-stack-id">{defId}</div>
          {entry.attribute ? (
            <div className="deck-stack-id">{entry.attribute}</div>
          ) : null}
        </button>
        {editable ? (
          <div className="deck-stack-edit">
            <button
              type="button"
              className="btn btn-secondary deck-stack-qty"
              aria-label={`Remove one ${entry.name}`}
              disabled={count <= 0}
              onClick={() => bump(-1)}
            >
              −
            </button>
            <span className="deck-stack-qty-label">{count}</span>
            <button
              type="button"
              className="btn btn-secondary deck-stack-qty"
              aria-label={`Add one ${entry.name}`}
              disabled={count >= MAX_COPIES_PER_CARD}
              onClick={() => bump(1)}
            >
              +
            </button>
            <button
              type="button"
              className="btn btn-secondary deck-stack-remove"
              aria-label={`Remove all ${entry.name}`}
              onClick={removeAll}
            >
              Remove
            </button>
          </div>
        ) : null}
        {editError ? <p className="deck-edit-error">{editError}</p> : null}
        {alts.length > 0 ? (
          <label className="deck-stack-art-label">
            Artwork
            <select
              className="deck-stack-art-select"
              value={selectedAlt}
              onChange={(e) => {
                setDeckArtPref(deck.id, defId, e.target.value || null);
                onChanged();
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

function toggleInList(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}

type Props = {
  deckId: string;
  /** Bump when parent saves/imports so editor reloads deck from storage. */
  refreshKey?: number;
  onDeckChanged?: () => void;
};

export function DeckEditor({ deckId, refreshKey = 0, onDeckChanged }: Props) {
  const [tick, setTick] = useState(0);
  const [query, setQuery] = useState("");
  const [colors, setColors] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [attributes, setAttributes] = useState<string[]>([]);
  const [counter, setCounter] = useState("");
  const [costMin, setCostMin] = useState("");
  const [costMax, setCostMax] = useState("");
  const [powerMin, setPowerMin] = useState("");
  const [powerMax, setPowerMax] = useState("");
  const [blocker, setBlocker] = useState<"" | "yes" | "no">("");
  const [rush, setRush] = useState<"" | "yes" | "no">("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [inspectDefId, setInspectDefId] = useState<string | null>(null);

  const deck = useMemo(() => {
    void tick;
    void refreshKey;
    return getSavedDeck(deckId);
  }, [deckId, tick, refreshKey]);

  const stacks = useMemo(
    () => (deck ? groupDeckStacks(deck.leaderId, deck.cards) : null),
    [deck],
  );

  const colorOpts = useMemo(() => listAtlasColors(), []);
  const typeOpts = useMemo(() => listAtlasTypes(), []);
  const counterOpts = useMemo(() => listAtlasCounters(), []);

  const searchFilters = useMemo(() => {
    const counterVal =
      counter === "" || counter === "none"
        ? null
        : Number.parseInt(counter, 10);
    return {
      query,
      colors,
      types,
      attributes,
      counter:
        counter === "none"
          ? null
          : Number.isFinite(counterVal)
            ? counterVal
            : null,
      counterNone: counter === "none",
      costMin: costMin === "" ? null : Number(costMin),
      costMax: costMax === "" ? null : Number(costMax),
      powerMin: powerMin === "" ? null : Number(powerMin),
      powerMax: powerMax === "" ? null : Number(powerMax),
      blocker: blocker === "" ? null : blocker === "yes",
      rush: rush === "" ? null : rush === "yes",
      excludeLeaders: true,
    };
  }, [
    query,
    colors,
    types,
    attributes,
    counter,
    costMin,
    costMax,
    powerMin,
    powerMax,
    blocker,
    rush,
  ]);

  const browsing = hasActiveCardSearch(searchFilters);
  const results = useMemo(
    () => (browsing ? searchAtlas(searchFilters) : []),
    [browsing, searchFilters],
  );

  if (!deck || !stacks) {
    return <p className="meta">Deck not found.</p>;
  }

  const currentDeck = deck;

  function refresh() {
    setTick((n) => n + 1);
    onDeckChanged?.();
  }

  function clearFilters() {
    setQuery("");
    setColors([]);
    setTypes([]);
    setAttributes([]);
    setCounter("");
    setCostMin("");
    setCostMax("");
    setPowerMin("");
    setPowerMax("");
    setBlocker("");
    setRush("");
    setSearchError(null);
  }

  function onAdd(defId: string) {
    setSearchError(null);
    const result = addCardToDeck(currentDeck.id, defId);
    if (!result.ok) {
      setSearchError(result.error);
      return;
    }
    refresh();
  }

  return (
    <>
      <section className="deck-config-section" aria-label="Add cards">
        <h2 className="lobby-section-title">Add cards</h2>
        <div className="deck-search">
          <label className="deck-search-field deck-search-query">
            <span>Search</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, id, or effect text"
              autoComplete="off"
            />
          </label>

          <div className="deck-search-filters" role="group" aria-label="Filters">
            <fieldset className="deck-filter-set">
              <legend>Color</legend>
              <div className="deck-filter-chips">
                {colorOpts.map((c) => (
                  <label key={c} className="deck-filter-chip">
                    <input
                      type="checkbox"
                      checked={colors.includes(c)}
                      onChange={() => setColors(toggleInList(colors, c))}
                    />
                    {c}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="deck-filter-set">
              <legend>Type</legend>
              <div className="deck-filter-chips">
                {typeOpts
                  .filter((t) => t !== "leader")
                  .map((t) => (
                    <label key={t} className="deck-filter-chip">
                      <input
                        type="checkbox"
                        checked={types.includes(t)}
                        onChange={() => setTypes(toggleInList(types, t))}
                      />
                      {t}
                    </label>
                  ))}
              </div>
            </fieldset>

            <fieldset className="deck-filter-set">
              <legend>Attribute</legend>
              <div className="deck-filter-chips">
                {ATTRIBUTE_OPTIONS.map((a) => (
                  <label key={a} className="deck-filter-chip">
                    <input
                      type="checkbox"
                      checked={attributes.includes(a)}
                      onChange={() => setAttributes(toggleInList(attributes, a))}
                    />
                    {a}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="deck-filter-row">
              <label className="deck-search-field">
                <span>Counter</span>
                <select value={counter} onChange={(e) => setCounter(e.target.value)}>
                  <option value="">Any</option>
                  <option value="none">None</option>
                  {counterOpts.map((n) => (
                    <option key={n} value={String(n)}>
                      +{n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="deck-search-field">
                <span>Cost min</span>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={costMin}
                  onChange={(e) => setCostMin(e.target.value)}
                />
              </label>
              <label className="deck-search-field">
                <span>Cost max</span>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={costMax}
                  onChange={(e) => setCostMax(e.target.value)}
                />
              </label>
              <label className="deck-search-field">
                <span>Power min</span>
                <input
                  type="number"
                  step={1000}
                  value={powerMin}
                  onChange={(e) => setPowerMin(e.target.value)}
                />
              </label>
              <label className="deck-search-field">
                <span>Power max</span>
                <input
                  type="number"
                  step={1000}
                  value={powerMax}
                  onChange={(e) => setPowerMax(e.target.value)}
                />
              </label>
              <label className="deck-search-field">
                <span>Blocker</span>
                <select
                  value={blocker}
                  onChange={(e) => setBlocker(e.target.value as "" | "yes" | "no")}
                >
                  <option value="">Any</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
              <label className="deck-search-field">
                <span>Rush</span>
                <select
                  value={rush}
                  onChange={(e) => setRush(e.target.value as "" | "yes" | "no")}
                >
                  <option value="">Any</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
            </div>

            <div className="deck-search-actions">
              <button type="button" className="btn btn-secondary" onClick={clearFilters}>
                Clear filters
              </button>
              {browsing ? (
                <span className="meta">{results.length} matches</span>
              ) : (
                <span className="meta">Search or filter to browse the catalog</span>
              )}
            </div>
          </div>

          {searchError ? (
            <p className="deck-edit-error" role="alert">
              {searchError}
            </p>
          ) : null}

          {browsing ? (
            <ul className="deck-search-results">
              {results.length === 0 ? (
                <li className="deck-search-empty meta">No cards match.</li>
              ) : (
                results.map((entry) => {
                  const inDeck = countCardInDeck(currentDeck, entry.id);
                  const imageUrl =
                    resolveCardImageUrl(entry.id, currentDeck) ?? entry.imageUrl;
                  const atCap = inDeck >= MAX_COPIES_PER_CARD;
                  const deckFull = currentDeck.cards.length >= MAX_MAIN_DECK_SIZE;
                  return (
                    <li key={entry.id} className="deck-search-row">
                      <button
                        type="button"
                        className="deck-search-open"
                        onClick={() => setInspectDefId(entry.id)}
                        aria-label={`View details for ${entry.name}`}
                      >
                        <div className="deck-search-thumb">
                          {imageUrl ? (
                            <img src={imageUrl} alt="" />
                          ) : (
                            <span>{entry.id}</span>
                          )}
                        </div>
                        <div className="deck-search-meta">
                          <div className="deck-stack-name">{entry.name}</div>
                          <div className="deck-stack-id">
                            {entry.id}
                            {entry.attribute ? ` · ${entry.attribute}` : ""}
                            {` · ${entry.type}`}
                            {entry.colors.length ? ` · ${entry.colors.join("/")}` : ""}
                            {entry.counter != null ? ` · +${entry.counter}` : ""}
                            {` · cost ${entry.cost}`}
                            {entry.power != null ? ` · ${entry.power}` : ""}
                            {inDeck > 0 ? ` · in deck ×${inDeck}` : ""}
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary deck-search-add"
                        disabled={atCap || deckFull}
                        onClick={() => onAdd(entry.id)}
                      >
                        Add
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          ) : (
            <p className="deck-search-idle meta" role="status">
              Type a search or apply a filter to show matching cards from the catalog. Your
              current deck list is below.
            </p>
          )}
        </div>
      </section>

      <section className="deck-config-section">
        <h2 className="lobby-section-title">Leader</h2>
        <div className="deck-stack-grid">
          <StackCard
            deck={currentDeck}
            defId={stacks.leader.defId}
            count={stacks.leader.count}
            editable={false}
            selected={inspectDefId === stacks.leader.defId}
            onSelect={() => setInspectDefId(stacks.leader.defId)}
            onChanged={refresh}
          />
        </div>
      </section>

      <section className="deck-config-section">
        <h2 className="lobby-section-title">
          Main deck ({stacks.main.length} unique · {currentDeck.cards.length} cards)
        </h2>
        {stacks.main.length === 0 ? (
          <p className="meta">No main-deck cards yet — import a list or add some above.</p>
        ) : (
          <div className="deck-stack-grid">
            {stacks.main.map((s) => (
              <StackCard
                key={s.defId}
                deck={currentDeck}
                defId={s.defId}
                count={s.count}
                editable
                selected={inspectDefId === s.defId}
                onSelect={() => setInspectDefId(s.defId)}
                onChanged={refresh}
              />
            ))}
          </div>
        )}
      </section>

      {inspectDefId ? (
        <CardInspect
          defId={inspectDefId}
          open
          deck={currentDeck}
          onDeckArtChange={refresh}
          onClose={() => setInspectDefId(null)}
        />
      ) : null}
    </>
  );
}
