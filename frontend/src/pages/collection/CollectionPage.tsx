import { useCardEdits } from "../../cache/useCardEdits";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, money, OwnedCard } from "../../api";
import { useCardLayout, useListDensity } from "../../ui/CardLayout";
import { FilterCheck, ListToolbar } from "../../ui/ListToolbar";
import {
  COLOR_ORDER,
  compareCardOrder,
  OWNED_DEFAULT_SORTS,
  OWNED_SORT_KEYS,
  useCardSorts,
  usePersistedChoice,
  usePersistedOpen,
  useShowAltArts,
  type SortKey,
} from "../../ui/cardListControls";
import { CardWorkspace } from "../../ui/CardWorkspace";
import { CollectionStatStrip } from "../../ui/CollectionToolbar";
import { COLLECTION_TYPES, filterOwnedCards, typesPresent } from "./collectionView";
import { useSavedShoppingDeckIds } from "../shopping/shoppingDeckFilter";
import { collectionTotals, holdsCopies, invalidateOwnedViews } from "./ownedCollection";
import { CardScanner } from "../../app/lazyPages";
import { useImageDrop } from "../../hooks/useImageDrop";
import { baseTileFor, shownProductId } from "../../cards/altArt";
import { AltArtsRow } from "../../cards/MarketPrice";
import { ShoppingListSkeleton } from "../../ui/Skeleton";
import { isDonCard } from "../../cards/donCards";
import { OwnedInput } from "../OwnedInputs";
import {
  COLLECTION_COLORS_KEY,
  COLSORT_COLLECTION_KEY,
  COLLECTION_SHOW_DONS_KEY,
  COLLECTION_SPARES_KEY,
  COLLECTION_TYPE_KEY,
  OWNED_SORTS_KEY,
} from "../../storage/keys";
import { jsonArrayCodec, usePersistedState } from "@optcg/ui/storage";
import { CollectionAddPanel, CollectionOwnedControl } from "./CollectionAddPanel";
import { CollectionItemsView } from "./CollectionItemsView";
import { qk } from "../../cache/queryKeys";

const isColor = (c: unknown): c is string => COLOR_ORDER.includes(c as string);
const collectionColorsCodec = jsonArrayCodec(isColor);

export function CollectionPage() {
  const qc = useQueryClient();
  const savedDeckIds = useSavedShoppingDeckIds();
  const { data, isLoading, error } = useQuery({
    queryKey: qk.owned.collection(savedDeckIds),
    queryFn: () => api.ownedCollection(savedDeckIds),
  });
  const noUnavailableSorts = useMemo(() => [] as SortKey[], []);
  const { sorts, setSorts, effectiveSorts } = useCardSorts(false, noUnavailableSorts, {
    storageKey: OWNED_SORTS_KEY,
    keys: OWNED_SORT_KEYS,
    defaults: OWNED_DEFAULT_SORTS,
  });
  const [layout, setLayout] = useCardLayout();
  const [density, setDensity] = useListDensity("collection");
  const [search, setSearch] = useState("");
  const [showDons, setShowDons] = usePersistedOpen(COLLECTION_SHOW_DONS_KEY, true);
  const [showAltArts, setShowAltArts] = useShowAltArts();
  const [sparesOnly, setSparesOnly] = usePersistedOpen(COLLECTION_SPARES_KEY, false);
  const [colors, setColors] = usePersistedState<string[]>(COLLECTION_COLORS_KEY, [], collectionColorsCodec);
  const [typeChoice, setTypeChoice] = usePersistedChoice(COLLECTION_TYPE_KEY, "", ["", ...COLLECTION_TYPES]);
  const [scanOpen, setScanOpen] = useState(false);
  const [droppedImage, setDroppedImage] = useState<Blob | null>(null);
  const [pageDragging, setPageDragging] = useState(false);
  useImageDrop({
    enabled: !scanOpen,
    onImage: (blob) => {
      setDroppedImage(blob);
      setScanOpen(true);
    },
    onDragStateChange: setPageDragging,
  });

  const allItems = data?.items ?? [];
  const ownedById = useMemo(() => new Map(allItems.map((i) => [i.card_id, i.owned])), [allItems]);
  const types = useMemo(() => typesPresent(allItems.filter((i) => showDons || !isDonCard(i))), [allItems, showDons]);
  const type = types.includes(typeChoice) ? typeChoice : "";
  const items = useMemo(() => {
    const list = filterOwnedCards(showDons ? allItems : allItems.filter((i) => !isDonCard(i)), {
      colors,
      type,
      sparesOnly,
      search,
    });
    return [...list].sort((a, b) => compareCardOrder(a, b, effectiveSorts));
  }, [allItems, showDons, sparesOnly, colors, type, search, effectiveSorts]);

  const shown = useMemo(() => collectionTotals(items.filter(holdsCopies)), [items]);
  const narrowed = items.length !== allItems.length;

  const activeFilters = (sparesOnly ? 1 : 0) + (showDons ? 0 : 1) + (showAltArts ? 0 : 1);

  function toggleColor(color: string) {
    setColors((prev) => (prev.includes(color) ? prev.filter((c) => c !== color) : [...prev, color]));
  }

  // Shopping and deck pages refetch; this page keeps its optimistic copy so a
  // card stepped down to 0 stays put instead of vanishing under the pointer.
  const onOwnedSaved = () => {
    void qc.invalidateQueries({ queryKey: qk.shopping.all() });
    void qc.invalidateQueries({ queryKey: qk.deck.all() });
  };

  const altArt = useCardEdits();
  const altRow = (item: OwnedCard) => (
    <AltArtsRow
      alts={item.alt_arts ?? []}
      cardId={item.card_id}
      editable
      base={baseTileFor(item, true)}
      baseOwnedControl={
        <OwnedInput compact name={item.name} cardId={item.card_id} value={item.owned} onSaved={onOwnedSaved} />
      }
      onOwnedChange={(productId, qty) => void altArt.changeAltOwned(item.card_id, productId, qty)}
      shownProductId={shownProductId(item)}
      onShow={(productId) => void altArt.changeDisplayArt(item.card_id, productId)}
      busyProductId={altArt.busyProductId(item.card_id)}
      onCollectorChange={(productId, qty) => void altArt.changeCollector(item.card_id, productId, qty)}
      collectorBusyProductId={altArt.collectorBusyProductId(item.card_id)}
    />
  );

  if (isLoading) return <ShoppingListSkeleton label="Loading your collection…" />;
  if (error) return <p className="error">{(error as Error).message}</p>;

  return (
    <section>
      <div className="page-head shopping-head collection-head">
        <div className="shopping-head-title">
          <p className="eyebrow">Cards you own</p>
          <h1>Collection</h1>
        </div>
        <div className="shopping-head-stats">
          <CollectionStatStrip data={data} />
        </div>
        <div className="page-head-actions">
          <CollectionAddPanel ownedById={ownedById} onScan={() => setScanOpen(true)} onOwnedSaved={onOwnedSaved} />
        </div>
      </div>

      {allItems.length === 0 ? (
        <p className="muted">
          No owned cards yet. Use Add cards, or set Owned on the <Link to="/">shopping list</Link> or a{" "}
          <Link to="/decks">deck</Link>. Owned is shared, so every deck counts these copies.
        </p>
      ) : (
        <>
          <CardWorkspace
            rail={
          <ListToolbar
            search={{ value: search, onChange: setSearch, placeholder: "Search name, ID, color…" }}
            colors={{ selected: colors, onToggle: toggleColor, onClear: () => setColors([]) }}
            types={{ types, value: type, onChange: setTypeChoice }}
            sort={{ sorts, onChange: setSorts, onlyNeed: false, keys: OWNED_SORT_KEYS, columnSortKey: COLSORT_COLLECTION_KEY }}
            filterBadge={activeFilters}
            filters={
              <>
                <div className="collection-filter-list">
                  <FilterCheck checked={sparesOnly} onChange={setSparesOnly}>
                    Not in a deck
                  </FilterCheck>
                  <FilterCheck checked={showDons} onChange={setShowDons}>
                    Show DON!!
                  </FilterCheck>
                  <FilterCheck checked={showAltArts} onChange={setShowAltArts}>
                    Show alt arts
                  </FilterCheck>
                </div>
                <p className="need-mode-note muted">
                  Value is owned copies × the standard printing&apos;s TCGPlayer market price.
                </p>
              </>
            }
            layout={layout}
            onLayout={setLayout}
            density={density}
            onDensity={setDensity}
          />
            }
          >

          {altArt.error && <p className="error">{altArt.error}</p>}
          {/* The head already shows the unfiltered totals, so this line only appears while a filter changes them. */}
          {narrowed ? (
            <p className="collection-count muted" role="status">
              Showing {shown.cards} of {allItems.length} cards · {shown.copies} {shown.copies === 1 ? "copy" : "copies"} · {money(shown.value)}
            </p>
          ) : null}
          {items.length === 0 ? (
            <p className="muted">No owned cards match the current search and filters.</p>
          ) : (
            <CollectionItemsView
              items={items}
              layout={layout}
              density={density}
              onOwnedSaved={onOwnedSaved}
              showAltArts={showAltArts}
              altRow={altRow}
            />
          )}
          </CardWorkspace>
        </>
      )}
      {pageDragging && !scanOpen && (
        <div className="page-drop-hint" role="status">
          Drop the card image to scan it
        </div>
      )}
      {scanOpen && (
        <CardScanner
          items={[]}
          showNeed={false}
          initialImage={droppedImage}
          multi={{ onAdded: () => invalidateOwnedViews(qc) }}
          renderHitAction={(card) => (
            <div className="scan-hit-owned">
              <span className="muted">In collection</span>
              <CollectionOwnedControl
                cardId={card.card_id}
                owned={ownedById.get(card.card_id) ?? 0}
                onSaved={onOwnedSaved}
              />
            </div>
          )}
          onClose={() => {
            setScanOpen(false);
            setDroppedImage(null);
          }}
        />
      )}
    </section>
  );
}
