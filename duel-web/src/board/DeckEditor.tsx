import { CardStack } from "@optcg/ui/cardStack";
import { useMediaQuery } from "@optcg/ui/hooks";
import { Dialog, DialogTitle, Menu, MenuButton, MenuItem, MenuList, Select, type SelectOption } from "@optcg/ui/popups";
import { readStored, writeStored } from "@optcg/ui/storage";
import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { CardArt } from "../cards/CardArt";
import { CardInspect } from "./preview/CardInspect";
import { DESKTOP_DECKS_QUERY } from "./layout/useMediaQuery";
import { lookupCard, maxCopiesFor } from "../cards/atlas";
import {
  hasActiveCardSearch,
  listAtlasColors,
  listAtlasCounters,
  listAtlasTypes,
  searchAtlas,
} from "../cards/searchAtlas";
import { capitalise, colourLabel } from "../cards/cardMeta";
import { sharesColour } from "../decks/deckLegality";
import { cardImageUrl, previewArtPath } from "@optcg/ui/cardArt";
import { canUseEachArt, EACH_ART_ID, resolveCardImageUrl, resolveDeckArtChoice, setDeckArtChoice } from "../decks/artPrefs";
import {
  addCard,
  countCardInDeck,
  MAX_MAIN_DECK_SIZE,
  removeCard,
  type CardsEditResult,
  type DeckDraft,
} from "../decks/editDeck";
import { DeckStatsSection } from "../decks/DeckStatsSection";
import { groupDeckStacks, groupStacksByCost } from "../decks/groupStacks";
import { type SavedDeck } from "../decks/storage";
import { useDuelSettings } from "../settings";

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
  onEdit,
  onChanged,
}: {
  deck: SavedDeck;
  defId: string;
  count: number;
  editable: boolean;
  selected: boolean;
  onSelect: () => void;
  onEdit: (edit: (cards: readonly string[]) => CardsEditResult) => string | null;
  onChanged: () => void;
}) {
  const entry = lookupCard(defId);
  const imageUrl = resolveCardImageUrl(defId, deck) ?? entry.imageUrl;
  const alts = entry.altArts ?? [];
  const selectedAlt = resolveDeckArtChoice(defId, deck);
  const eachArt = selectedAlt === EACH_ART_ID;
  const copyUrl = (copy: number) =>
    (eachArt ? resolveCardImageUrl(defId, { deck, artCopy: copy }) : undefined) ?? imageUrl;
  const [editError, setEditError] = useState<string | null>(null);

  function bump(delta: -1 | 1) {
    setEditError(null);
    const error = onEdit((cards) => (delta < 0 ? removeCard(cards, defId) : addCard(cards, defId)));
    if (error) setEditError(error);
  }

  const standardSrc = entry.imageUrl ?? previewArtPath(defId) ?? undefined;
  const artOptions: { value: string; label: string; thumbs: (string | undefined)[] }[] = [
    { value: "", label: "Standard", thumbs: [standardSrc] },
    ...alts.map((a) => ({ value: a.id, label: a.label, thumbs: [a.imageUrl] })),
    ...(canUseEachArt(defId)
      ? [{ value: EACH_ART_ID, label: "One of each art", thumbs: [standardSrc, alts[0]?.imageUrl] }]
      : []),
  ];

  return (
    <article
      className={`deck-stack${selected ? " selected" : ""}${editable ? " is-editable" : ""}`}
      data-selected={selected ? "true" : undefined}
    >
      <div className="deck-stack-art-wrap">
        <button
          type="button"
          className="deck-stack-art-btn"
          onClick={onSelect}
          aria-pressed={selected}
          aria-label={`View details for ${entry.name}`}
        >
          <CardStack
            className="deck-stack-pile"
            count={count}
            reserve
            copy={(layer) => (
              <CardArt
                src={copyUrl(layer)}
                defId={defId}
                className="deck-stack-img"
                fallback={<div className="deck-stack-fallback">{defId}</div>}
              />
            )}
          >
            <div className="deck-stack-art">
              <CardArt
                src={copyUrl(0)}
                defId={defId}
                className="deck-stack-img"
                fallback={<div className="deck-stack-fallback">{defId}</div>}
              />
            </div>
          </CardStack>
        </button>
        {editable ? (
          <div className="deck-stack-stepper" role="group" aria-label={`${entry.name} copies`}>
            <button
              type="button"
              className="deck-stack-qty"
              aria-label={`Remove one ${entry.name}`}
              title={count <= 1 ? "Remove from deck" : undefined}
              disabled={count <= 0}
              onClick={() => bump(-1)}
            >
              −
            </button>
            <span className="deck-stack-qty-label" aria-label={`${count} copies`}>
              {count}
            </span>
            <button
              type="button"
              className="deck-stack-qty"
              aria-label={`Add one ${entry.name}`}
              disabled={count >= maxCopiesFor(entry.id)}
              onClick={() => bump(1)}
            >
              +
            </button>
          </div>
        ) : null}
      </div>
      <div className="deck-stack-meta">
        <button type="button" className="deck-stack-name-btn" onClick={onSelect}>
          <div className="deck-stack-name">{entry.name}</div>
          <div className="deck-stack-id">{defId}</div>
        </button>
        {alts.length > 0 ? (
          <Menu>
            <MenuButton type="button" className="deck-art-menu-btn" aria-label={`Artwork for ${entry.name}`} title="Choose artwork">
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
                <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="5.5" cy="6.25" r="1.2" fill="currentColor" />
                <path d="M2.5 12.2l3.8-3.6 2.6 2.4 1.9-1.7 3.2 2.9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
            </MenuButton>
            <MenuList anchor={{ to: "bottom end", gap: 4, padding: 8 }} className="deck-art-menu">
              {artOptions.map((o) => (
                <MenuItem key={o.value}>
                  <button
                    type="button"
                    className="deck-art-menu-item"
                    aria-current={selectedAlt === o.value ? "true" : undefined}
                    onClick={() => {
                      setDeckArtChoice(deck.id, defId, o.value || null);
                      onChanged();
                    }}
                  >
                    <span className="deck-art-thumbs" aria-hidden>
                      {o.thumbs.map((src, i) => (
                        <CardArt
                          key={i}
                          src={src ? cardImageUrl(src, "thumb") || src : undefined}
                          defId={defId}
                          className="deck-art-thumb"
                          fallback={<span className="deck-art-thumb deck-art-thumb-empty" />}
                          loading="lazy"
                        />
                      ))}
                    </span>
                    <span className="deck-art-menu-label">{o.label}</span>
                    <span className="deck-art-menu-check" aria-hidden>
                      {selectedAlt === o.value ? "✓" : ""}
                    </span>
                  </button>
                </MenuItem>
              ))}
            </MenuList>
          </Menu>
        ) : null}
      </div>
      {editError ? <p className="deck-edit-error">{editError}</p> : null}
    </article>
  );
}

const YES_NO_OPTIONS: readonly SelectOption<"" | "yes" | "no">[] = [
  { value: "", label: "Any" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

function toggleInList(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}

type Props = {
  deck: SavedDeck;
  onChange: (next: DeckDraft) => void;
  onArtChanged?: () => void;
  /** The "Replace with deck list" panel. On phones it opens from a button, so it is rendered as a plain panel there. */
  sideTop?: (panel: boolean) => ReactNode;
  /** Copies the deck as an OPTCGSim code; shows a Copy list action beside the import tools. */
  onCopyList?: () => void;
};

const FILTERS_OPEN_KEY = "optcg-duel:deck-filters-open";

/** Filters that live behind "More filters"; the badge counts how many are set. */
export function countHiddenFilters(f: {
  types: readonly string[];
  attributes: readonly string[];
  counter: string;
  costMin: string;
  costMax: string;
  powerMin: string;
  powerMax: string;
  blocker: string;
  rush: string;
}): number {
  return (
    (f.types.length > 0 ? 1 : 0) +
    (f.attributes.length > 0 ? 1 : 0) +
    [f.counter, f.costMin, f.costMax, f.powerMin, f.powerMax, f.blocker, f.rush].filter((v) => v !== "").length
  );
}

type ToolPanel = "stats" | "replace" | null;

export function DeckEditor({ deck, onChange, onArtChanged, sideTop, onCopyList }: Props) {
  const [query, setQuery] = useState("");
  const leaderColors = useMemo(() => [...lookupCard(deck.leaderId).colors], [deck.leaderId]);
  const [colors, setColors] = useState<string[]>(leaderColors);
  const [colorsFor, setColorsFor] = useState(deck.leaderId);
  if (colorsFor !== deck.leaderId) {
    setColorsFor(deck.leaderId);
    setColors(leaderColors);
  }
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
  const { deckStats } = useDuelSettings();
  const isDesktop = useMediaQuery(DESKTOP_DECKS_QUERY);
  const [addOpen, setAddOpen] = useState(isDesktop);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [toolPanel, setToolPanel] = useState<ToolPanel>(null);
  const [filtersOpen, setFiltersOpen] = useState(() => readStored(FILTERS_OPEN_KEY) === "1");

  const hiddenFilterCount = countHiddenFilters({ types, attributes, counter, costMin, costMax, powerMin, powerMax, blocker, rush });

  const stacks = useMemo(() => groupDeckStacks(deck.leaderId, deck.cards), [deck.leaderId, deck.cards]);

  const costGroups = useMemo(() => groupStacksByCost(stacks.main, (id) => lookupCard(id).cost), [stacks.main]);

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

  const deferredFilters = useDeferredValue(searchFilters);
  const browsing = hasActiveCardSearch(deferredFilters);
  const results = useMemo(
    () => (browsing ? searchAtlas(deferredFilters) : []),
    [browsing, deferredFilters],
  );

  const currentDeck = deck;

  function edit(change: (cards: readonly string[]) => CardsEditResult): string | null {
    const result = change(currentDeck.cards);
    if (!result.ok) return result.error;
    onChange({ name: currentDeck.name, leaderId: currentDeck.leaderId, cards: result.cards });
    return null;
  }

  function refresh() {
    onArtChanged?.();
  }

  function clearFilters() {
    setQuery("");
    setColors(leaderColors);
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
    const error = edit((cards) => addCard(cards, defId));
    if (error) setSearchError(error);
  }

  const addBody = (
    <div className="deck-search">
      <label className="deck-search-field deck-search-query">
        <span className="visually-hidden">Search</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, id, or effect text"
          autoComplete="off"
          aria-label="Search"
        />
      </label>

      <div className="deck-search-filters" role="group" aria-label="Filters">
        <div className="deck-color-chips" role="group" aria-label="Color">
          {colorOpts.map((c) => (
            <label key={c} className="deck-filter-chip deck-color-chip" data-color={c.toLowerCase()}>
              <input type="checkbox" checked={colors.includes(c)} onChange={() => setColors(toggleInList(colors, c))} />
              <span className="deck-color-dot" aria-hidden />
              {c}
            </label>
          ))}
        </div>

        {leaderColors.length > 0 && colors.length === leaderColors.length && leaderColors.every((c) => colors.includes(c)) ? (
          <p className="deck-color-hint meta">Showing your Leader's colours. Untick to see all.</p>
        ) : null}

        <div className="deck-search-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm deck-more-filters-btn"
            aria-expanded={filtersOpen}
            aria-controls="deck-more-filters"
            onClick={() => {
              const next = !filtersOpen;
              setFiltersOpen(next);
              writeStored(FILTERS_OPEN_KEY, next ? "1" : "0");
            }}
          >
            More filters
            {hiddenFilterCount > 0 ? (
              <span className="deck-more-filters-badge" aria-label={`${hiddenFilterCount} active`}>
                {hiddenFilterCount}
              </span>
            ) : null}
          </button>
          {browsing ? <span className="meta">{results.length} matches</span> : null}
          <button type="button" className="btn btn-ghost btn-sm deck-clear-filters" onClick={clearFilters}>
            Clear filters
          </button>
        </div>

        {filtersOpen ? (
          <div id="deck-more-filters" className="deck-more-filters">
            <fieldset className="deck-filter-set">
              <legend>Type</legend>
              <div className="deck-filter-chips">
                {typeOpts
                  .filter((t) => t !== "leader")
                  .map((t) => (
                    <label key={t} className="deck-filter-chip">
                      <input type="checkbox" checked={types.includes(t)} onChange={() => setTypes(toggleInList(types, t))} />
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
                    <input type="checkbox" checked={attributes.includes(a)} onChange={() => setAttributes(toggleInList(attributes, a))} />
                    {a}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="deck-filter-row">
              <label className="deck-search-field">
                <span>Counter</span>
                <Select
                  value={counter}
                  onChange={setCounter}
                  options={[
                    { value: "", label: "Any" },
                    { value: "none", label: "None" },
                    ...counterOpts.map((n) => ({ value: String(n), label: `+${n}` })),
                  ]}
                />
              </label>
              <label className="deck-search-field">
                <span>Cost min</span>
                <input type="number" min={0} max={10} value={costMin} onChange={(e) => setCostMin(e.target.value)} />
              </label>
              <label className="deck-search-field">
                <span>Cost max</span>
                <input type="number" min={0} max={10} value={costMax} onChange={(e) => setCostMax(e.target.value)} />
              </label>
              <label className="deck-search-field">
                <span>Power min</span>
                <input type="number" step={1000} value={powerMin} onChange={(e) => setPowerMin(e.target.value)} />
              </label>
              <label className="deck-search-field">
                <span>Power max</span>
                <input type="number" step={1000} value={powerMax} onChange={(e) => setPowerMax(e.target.value)} />
              </label>
              <label className="deck-search-field">
                <span>Blocker</span>
                <Select value={blocker} onChange={setBlocker} options={YES_NO_OPTIONS} />
              </label>
              <label className="deck-search-field">
                <span>Rush</span>
                <Select value={rush} onChange={setRush} options={YES_NO_OPTIONS} />
              </label>
            </div>
          </div>
        ) : null}
      </div>

      {searchError ? (
        <p className="deck-edit-error" role="alert">
          {searchError}
        </p>
      ) : null}

      {browsing && currentDeck.cards.length >= MAX_MAIN_DECK_SIZE ? (
        <p className="deck-search-note meta" role="status">
          Deck full ({MAX_MAIN_DECK_SIZE}/{MAX_MAIN_DECK_SIZE}). Remove a card to add another.
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
              const atCap = inDeck >= maxCopiesFor(entry.id);
              const deckFull = currentDeck.cards.length >= MAX_MAIN_DECK_SIZE;
              const offColour = !sharesColour(leaderColors, entry.colors);
              return (
                <li key={entry.id} className="deck-search-row">
                  <button
                    type="button"
                    className="deck-search-open"
                    onClick={() => setInspectDefId(entry.id)}
                    aria-label={`View details for ${entry.name}`}
                  >
                    <div className="deck-search-thumb">
                      <CardArt src={imageUrl} defId={entry.id} fallback={<span>{entry.id}</span>} loading="lazy" />
                    </div>
                    <div className="deck-search-meta">
                      <div className="deck-stack-name">{entry.name}</div>
                      <div className="deck-stack-id">
                        {entry.id}
                        {entry.attribute ? ` · ${entry.attribute}` : ""}
                        {` · ${capitalise(entry.type)}`}
                        {entry.colors.length ? ` · ${colourLabel(entry.colors)}` : ""}
                        {` · Cost ${entry.cost}`}
                        {entry.power != null ? ` · ${entry.power} power` : ""}
                        {entry.counter != null ? ` · +${entry.counter} counter` : ""}
                        {inDeck > 0 ? ` · in deck ×${inDeck}` : ""}
                      </div>
                      {offColour ? <div className="deck-search-reason">Not your Leader's colour</div> : null}
                    </div>
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary deck-search-add"
                    disabled={atCap || deckFull || offColour}
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
          Search or pick a colour to browse the catalog.
        </p>
      )}
    </div>
  );

  const leaderSection = (
    <section className="deck-config-section deck-editor-leader">
      <h2 className="lobby-section-title">Leader</h2>
      <div className="deck-stack-grid">
        <StackCard
          deck={currentDeck}
          defId={stacks.leader.defId}
          count={stacks.leader.count}
          editable={false}
          selected={inspectDefId === stacks.leader.defId}
          onSelect={() => setInspectDefId(stacks.leader.defId)}
          onEdit={edit}
          onChanged={refresh}
        />
      </div>
    </section>
  );

  const deckSection = (
    <section className="deck-config-section deck-editor-deck">
      <h2 className="lobby-section-title">
        Main deck ({stacks.main.length} unique · {currentDeck.cards.length} cards)
      </h2>
      {stacks.main.length === 0 ? (
        <p className="meta">No main-deck cards yet. Import a list or add some.</p>
      ) : (
        <div className="deck-cost-groups">
          {costGroups.map((g) => (
            <section key={g.cost} className="deck-cost-group">
              <h3 className="deck-cost-heading">
                <span>Cost {g.cost}</span>
                <span className="deck-cost-count">
                  <span aria-hidden>{g.cards}</span>
                  <span className="visually-hidden">{g.cards} cards</span>
                </span>
              </h3>
              <div className="deck-cost-tiles">
                {g.stacks.map((s) => (
                  <StackCard
                    key={s.defId}
                    deck={currentDeck}
                    defId={s.defId}
                    count={s.count}
                    editable
                    selected={inspectDefId === s.defId}
                    onSelect={() => setInspectDefId(s.defId)}
                    onEdit={edit}
                    onChanged={refresh}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );

  const inspect = inspectDefId ? (
    <CardInspect
      defId={inspectDefId}
      open
      deck={currentDeck}
      onDeckArtChange={refresh}
      onClose={() => setInspectDefId(null)}
    />
  ) : null;

  if (isDesktop) {
    return (
      <div className="deck-editor-layout">
        <aside className="deck-editor-side">
          {sideTop?.(false)}
          {onCopyList ? (
            <button type="button" className="btn btn-secondary btn-sm deck-copy-list-btn" onClick={onCopyList}>
              Copy deck list
            </button>
          ) : null}
          {deckStats ? <DeckStatsSection deck={currentDeck} /> : null}
          <details
            className="deck-config-section deck-collapsible deck-add-cards"
            aria-label="Add cards"
            open={addOpen}
            onToggle={(e) => setAddOpen(e.currentTarget.open)}
          >
            <summary className="deck-collapsible-summary">
              <h2 className="lobby-section-title">Add cards</h2>
            </summary>
            <div className="deck-collapsible-body">{addBody}</div>
          </details>
        </aside>
        <div className="deck-editor-main">
          {leaderSection}
          {deckSection}
        </div>
        {inspect}
      </div>
    );
  }

  const toolButton = (id: Exclude<ToolPanel, null>, label: string) => (
    <button
      type="button"
      className="btn btn-secondary btn-sm deck-tool-btn"
      aria-expanded={toolPanel === id}
      onClick={() => setToolPanel(toolPanel === id ? null : id)}
    >
      {label}
    </button>
  );

  return (
    <div className="deck-editor-layout is-compact">
      <div className="deck-tools" role="group" aria-label="Deck tools">
        {deckStats ? toolButton("stats", "Deck stats") : null}
        {sideTop ? toolButton("replace", "Replace list") : null}
        {onCopyList ? (
          <button type="button" className="btn btn-secondary btn-sm deck-tool-btn" onClick={onCopyList}>
            Copy list
          </button>
        ) : null}
      </div>
      {toolPanel === "stats" && deckStats ? <DeckStatsSection deck={currentDeck} panel /> : null}
      {toolPanel === "replace" ? sideTop?.(true) : null}
      <div className="deck-editor-main">
        {leaderSection}
        {deckSection}
      </div>
      <div className="deck-bottom-bar">
        <span className="deck-bottom-count">
          <strong>{currentDeck.cards.length}</strong>/{MAX_MAIN_DECK_SIZE} cards
        </span>
        <button type="button" className="btn btn-secondary deck-bottom-add" onClick={() => setSheetOpen(true)}>
          Add cards
        </button>
      </div>
      <Dialog open={sheetOpen} onClose={() => setSheetOpen(false)} label="Add cards" className="deck-add-sheet-backdrop" panelClassName="deck-add-sheet">
        <div className="deck-add-sheet-head">
          <DialogTitle as="h2" className="lobby-section-title">
            Add cards
          </DialogTitle>
          <span className="deck-bottom-count">
            <strong>{currentDeck.cards.length}</strong>/{MAX_MAIN_DECK_SIZE} cards
          </span>
          <button type="button" className="btn btn-primary" onClick={() => setSheetOpen(false)}>
            Done
          </button>
        </div>
        <div className="deck-add-sheet-body">{addBody}</div>
      </Dialog>
      {inspect}
    </div>
  );
}
