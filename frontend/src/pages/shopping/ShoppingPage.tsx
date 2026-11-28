import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, CollectorLine, ShoppingItem, User } from "../../api";
import { blankMassEntryUrl, buildMassEntryExport } from "./tcgplayerMassEntry";
import { buyCards, pickSelection } from "./shoppingBuy";
import { ShoppingBuyButton, ShoppingBuyDock } from "./ShoppingBuyControls";
import { shoppingMenuPrice } from "./deckCost";
import { UndoToast } from "../collection/CollectorLine";
import { SettledScopeProvider, useSettledOrder } from "../../ui/useSettledOrder";
import { useColumnSort } from "../../ui/columnSort";
import { shownWhileOnlyNeed } from "./GroupBuyChip";
import { useMe } from "../../auth/useMe";
import { useCardLayout, useListDensity } from "../../ui/CardLayout";
import { FilterCheck, HintHeading, ListToolbar } from "../../ui/ListToolbar";
import { cardHasColor, cardHasType, COLLECTION_TYPES, typesPresent } from "../collection/collectionView";
import {
  COLOR_ORDER,
  compareCardOrder,
  matchesCardSearch,
  useCardSorts,
  usePersistedChoice,
  usePersistedOpen,
  useShowAltArts,
  type SortKey,
} from "../../ui/cardListControls";
import { CardWorkspace } from "../../ui/CardWorkspace";
import { loadShoppingDeckFilter, saveShoppingDeckFilter } from "./shoppingDeckFilter";
import { invalidateOwnedViews } from "../collection/ownedCollection";
import { CardScanner } from "../../app/lazyPages";
import { useImageDrop } from "../../hooks/useImageDrop";
import { baseTileFor, shownProductId } from "../../cards/altArt";
import { useCardEdits } from "../../cache/useCardEdits";
import { busyKeyFor } from "../../cache/busyKey";
import { AltArtsRow } from "../../cards/MarketPrice";
import { ShoppingListSkeleton } from "../../ui/Skeleton";
import { useNarrowLayout } from "../../hooks/useNarrowLayout";
import { showExtraCopiesChip } from "../../ui/deckGroups";
import { DeckIncludeFilter } from "../../ui/DeckIncludeFilter";
import { useFullShoppingById, ShoppingScanHitAction } from "./lightboxActions";
import { invalidateAltWantViews, invalidateCollectorViews } from "../../cache/invalidate";
import {
  applyAltBuyOptimistic,
  applyCollectorOptimistic,
  applyOwnedOptimistic,
} from "../../cache/optimistic";
import { type CollectorControls, ShoppingItemsView } from "./ShoppingItemsView";
import { OwnedInput } from "../OwnedInputs";
import { isDonCard } from "../../cards/donCards";
import { ShoppingStatStrip } from "./shoppingStats";
import { ShoppingSharePanel } from "../SharePanels";
import { ShoppingAddPanel } from "./ShoppingAddPanel";
import { PriceCheck, PriceCheckToolbarButton } from "./PriceCheck";
import {
  COLSORT_SHOPPING_KEY,
  SHOPPING_EXTRAS_KEY,
  SHOPPING_COLLECTOR_KEY,
  SHOPPING_COLORS_KEY,
  SHOPPING_ONLY_NEED_KEY,
  SHOPPING_TYPE_KEY,
  SHOPPING_SELECTED_KEY,
  SHOW_SHOPPING_DONS_KEY,
} from "../../storage/keys";
import { jsonArrayCodec, jsonSetCodec, usePersistedState } from "@optcg/ui/storage";
import { qk } from "../../cache/queryKeys";
import { copyText } from "@optcg/ui/clipboard";

const shoppingItemId = (i: ShoppingItem) => i.card_id;
const isString = (x: unknown): x is string => typeof x === "string";
const selectedCardsCodec = jsonSetCodec(isString);
const isColor = (c: unknown): c is string => COLOR_ORDER.includes(c as string);
const shoppingColorsCodec = jsonArrayCodec(isColor);

export function ShoppingPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const isNarrow = useNarrowLayout();
  const decksQ = useQuery({ queryKey: qk.decks(), queryFn: api.decks });
  const allDeckIds = useMemo(() => (decksQ.data ?? []).map((d) => d.id), [decksQ.data]);
  const [selectedDeckIds, setSelectedDeckIds] = useState<number[] | null>(null);
  const [filterReady, setFilterReady] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = usePersistedState<Set<string>>(SHOPPING_SELECTED_KEY, new Set(), selectedCardsCodec);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!decksQ.data) return;
    const ids = decksQ.data.map((d) => d.id);
    const saved = loadShoppingDeckFilter(ids);
    setSelectedDeckIds(saved ?? ids);
    setFilterReady(true);
  }, [decksQ.data]);

  useEffect(() => {
    // With no decks there is nothing to pick: saving [] would untick decks imported later (#1211).
    if (!filterReady || selectedDeckIds === null || allDeckIds.length === 0) return;
    saveShoppingDeckFilter(selectedDeckIds);
  }, [selectedDeckIds, filterReady, allDeckIds.length]);

  const activeDeckIds = selectedDeckIds ?? allDeckIds;
  const shoppingKey = useMemo(
    () => [...activeDeckIds].sort((a, b) => a - b),
    [activeDeckIds],
  );

  const [includeExtras, setIncludeExtras] = usePersistedOpen(SHOPPING_EXTRAS_KEY, true);
  const [includeCollector, setIncludeCollector] = usePersistedOpen(SHOPPING_COLLECTOR_KEY, true);
  const { data, isLoading, error } = useQuery({
    queryKey: qk.shopping.list(shoppingKey, includeExtras, includeCollector),
    queryFn: () =>
      api.shopping(shoppingKey, {
        extras: includeExtras,
        collector: includeCollector,
      }),
    enabled: filterReady,
    // Ticking a deck or a chip in Filters changes the key; keep the old list (and the open Filters panel) until the new one lands.
    placeholderData: keepPreviousData,
  });
  const fullShoppingById = useFullShoppingById();
  const hasExtras = useMemo(
    () => [...fullShoppingById.values()].some((i) => (i.extra_qty ?? 0) > 0),
    [fullShoppingById],
  );
  const hasCollectorWants = useMemo(
    () => [...fullShoppingById.values()].some((i) => (i.collector_wants?.length ?? 0) > 0),
    [fullShoppingById],
  );
  const removeExtra = useMutation({
    mutationFn: (cardId: string) => api.setShoppingExtra(cardId, 0),
    onSuccess: () => invalidateOwnedViews(qc),
  });
  const shareQ = useQuery({
    queryKey: qk.share.shopping(),
    queryFn: api.getShoppingShare,
    enabled: filterReady,
  });
  const meQ = useMe();
  const sumAcrossLeaders = Boolean(meQ.data?.sum_across_leaders);
  const setSumAcrossLeaders = useMutation({
    mutationFn: (value: boolean) => api.updatePreferences({ sum_across_leaders: value }),
    onMutate: (value) => {
      const prev = qc.getQueryData<User | null>(qk.me());
      qc.setQueryData<User | null>(qk.me(), (old) =>
        old ? { ...old, sum_across_leaders: value } : old,
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.me(), ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.me() });
      invalidateAltWantViews(qc);
    },
  });
  const [onlyNeed, setOnlyNeed] = usePersistedOpen(SHOPPING_ONLY_NEED_KEY, true);
  const [showDons, setShowDons] = usePersistedOpen(SHOW_SHOPPING_DONS_KEY, true);
  const shoppingUnavailableSorts = useMemo(() => ["user"] as SortKey[], []);
  const { sorts, setSorts, effectiveSorts } = useCardSorts(onlyNeed, shoppingUnavailableSorts);
  const [showAltArts, setShowAltArts] = useShowAltArts();
  const [layout, setLayout] = useCardLayout();
  const [density, setDensity] = useListDensity("shopping");
  const [colors, setColors] = usePersistedState<string[]>(SHOPPING_COLORS_KEY, [], shoppingColorsCodec);
  const [typeChoice, setTypeChoice] = usePersistedChoice(SHOPPING_TYPE_KEY, "", ["", ...COLLECTION_TYPES]);
  const [search, setSearch] = useState("");
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
  const {
    busyKey: altOwnedBusyKey,
    error: altOwnedErr,
    setError: setAltOwnedErr,
    changeAltOwned: changeShoppingAltOwned,
    changeAltBuy: changeShoppingAltBuy,
    changeCollector,
    collectorBusyKey,
    collectorBusyProductId,
    changeDisplayArt: changeShoppingDisplayArt,
    busyProductId: altOwnedBusyProductId,
  } = useCardEdits({
    saveAltBuy: async (cardId, productId, qty) => {
      const deckIds = activeDeckIds.length === allDeckIds.length ? undefined : activeDeckIds;
      const res = await api.setCardPrinting(cardId, productId, qty, deckIds);
      applyAltBuyOptimistic(qc, cardId, productId, res.qty);
    },
  });
  const sortingByDeck = effectiveSorts.includes("deck");


  const [collectorUndo, setCollectorUndo] = useState<{ cardId: string; productId: number; qty: number; label: string } | null>(null);
  const dismissCollectorUndo = useCallback(() => setCollectorUndo(null), []);

  const removeCollector = async (cardId: string, line: CollectorLine) => {
    setCollectorUndo({ cardId, productId: line.product_id, qty: line.want, label: line.label });
    await changeCollector(cardId, line.product_id, 0);
  };

  const undoCollectorRemove = () => {
    const undo = collectorUndo;
    setCollectorUndo(null);
    if (undo) void changeCollector(undo.cardId, undo.productId, undo.qty);
  };

  const collectorControls: CollectorControls = {
    onChange: (cardId, productId, qty) => void changeCollector(cardId, productId, qty),
    onRemove: (cardId, line) => void removeCollector(cardId, line),
    busyKey: collectorBusyKey,
    onlyNeed,
  };

  const shoppingAltRow = (item: ShoppingItem) => (
    <AltArtsRow
      alts={item.alt_arts ?? []}
      cardId={item.card_id}
      editable
      base={baseTileFor(item, true)}
      baseOwnedControl={
        <OwnedInput
          compact
          name={item.name}
          cardId={item.card_id}
          value={item.owned}
          onSaved={() => invalidateOwnedViews(qc)}
        />
      }
      onOwnedChange={(productId, qty) => {
        const before = (item.alt_arts ?? []).find((a) => a.product_id === productId)?.owned ?? 0;
        settled.scope.markEdited(item.card_id, { key: `alt:${productId}`, restore: () => changeShoppingAltOwned(item.card_id, productId, before) });
        void changeShoppingAltOwned(item.card_id, productId, qty);
      }}
      showBuyPicks={item.still_need > 0}
      shownProductId={shownProductId(item)}
      onShow={(productId) => void changeShoppingDisplayArt(item.card_id, productId)}
      onCollectorChange={(productId, qty) => {
        const line = (item.collector_wants ?? []).find((l) => l.product_id === productId);
        if (qty === 0 && line) void removeCollector(item.card_id, line);
        else void changeCollector(item.card_id, productId, qty);
      }}
      collectorBusyProductId={collectorBusyProductId(item.card_id)}
      busyProductId={altOwnedBusyProductId(item.card_id)}
    />
  );

  const typeOptions = useMemo(
    () => typesPresent((data?.items ?? []).filter((i) => showDons || !isDonCard(i))),
    [data, showDons],
  );
  const type = typeOptions.includes(typeChoice) ? typeChoice : "";
  function toggleColor(color: string) {
    setColors((prev) => (prev.includes(color) ? prev.filter((c) => c !== color) : [...prev, color]));
  }

  const filteredItems = useMemo(() => {
    let list = data?.items ?? [];
    if (onlyNeed) list = list.filter(shownWhileOnlyNeed);
    if (colors.length) list = list.filter((i) => cardHasColor(i, colors));
    if (type) list = list.filter((i) => cardHasType(i, type));
    if (search.trim()) list = list.filter((i) => matchesCardSearch(i, search));
    list = [...list].sort((a, b) => compareCardOrder({ ...a, market_price: shoppingMenuPrice(a) }, { ...b, market_price: shoppingMenuPrice(b) }, effectiveSorts));
    return list;
  }, [data, onlyNeed, effectiveSorts, search, colors, type]);

  const mainItems = useMemo(() => filteredItems.filter((i) => !isDonCard(i)), [filteredItems]);
  const donItems = useMemo(() => filteredItems.filter((i) => isDonCard(i)), [filteredItems]);
  const hasDonsInData = useMemo(() => (data?.items ?? []).some(isDonCard), [data]);
  const items = useMemo(
    () => (showDons ? [...mainItems, ...donItems] : mainItems),
    [mainItems, donItems, showDons],
  );

  const { sort: columnSort } = useColumnSort(COLSORT_SHOPPING_KEY);
  // Anything that changes what the list shows settles it at once; editing a row only holds that row (#1498).
  const settleKey = JSON.stringify([
    onlyNeed, effectiveSorts, search, colors, type, showDons, includeExtras, includeCollector, shoppingKey, columnSort, layout, density, showAltArts,
  ]);
  const settled = useSettledOrder({
    target: items,
    live: data?.items ?? [],
    getId: shoppingItemId,
    resetKey: settleKey,
    describeDone: (i) => `${i.name} covered, ${i.need} of ${i.need}.`,
  });
  const shownMain = useMemo(() => settled.items.filter((i) => !isDonCard(i)), [settled.items]);
  const shownDons = useMemo(() => (showDons ? settled.items.filter((i) => isDonCard(i)) : []), [settled.items, showDons]);

  const selection = useMemo(() => pickSelection(data?.items ?? [], selectedCardIds), [data, selectedCardIds]);
  const selectedItems = selection.items;
  const selectedCollectorLines = selection.lines;

  const selectedTotals = useMemo(() => {
    let copies = 0;
    let total = 0;
    let priced = 0;
    let count = 0;
    for (const item of selectedItems) {
      count += 1;
      copies += item.still_need;
      if (item.remaining_cost != null) {
        total += item.remaining_cost;
        priced += 1;
      }
    }
    for (const { line } of selectedCollectorLines) {
      count += 1;
      copies += line.still_need;
      if (line.remaining_cost != null) {
        total += line.remaining_cost;
        priced += 1;
      }
    }
    return { count, copies, total: Math.round(total * 100) / 100, priced };
  }, [selectedItems, selectedCollectorLines]);

  const hasSelection = selectedTotals.count > 0;
  // Selected extra copies go to Mass Entry as their own printing; Buying in person only adds base copies, so it skips them.
  // With nothing ticked, Buy on TCGPlayer takes every card still to buy, the same cards as Cards to buy and Est. cost.
  const massEntry = useMemo(() => buildMassEntryExport(buyCards(data?.items ?? [], selection)), [data, selection]);

  async function copyMassEntryList(): Promise<boolean> {
    if (!massEntry.pasteText) {
      setExportMsg("Nothing to buy: no cards need copies.");
      return false;
    }
    if (await copyText(massEntry.pasteText)) return true;
    setExportMsg(massEntry.pasteText);
    return false;
  }

  async function onCopyMassEntry() {
    const ok = await copyMassEntryList();
    if (!ok) return;
    const missing =
      massEntry.missingProductId > 0
        ? `, ${massEntry.missingProductId} without product id (name fallback)`
        : "";
    setExportMsg(
      `Copied ${massEntry.includedCount} card${massEntry.includedCount === 1 ? "" : "s"} (${massEntry.copyCount} copies) for TCGPlayer Mass Entry${missing}`,
    );
  }

  async function onOpenMassEntry() {
    if (!massEntry.pasteText) {
      setExportMsg("Nothing to buy: no cards need copies.");
      return;
    }
    const copied = await copyMassEntryList();
    if (massEntry.url) {
      window.open(massEntry.url, "_blank", "noopener,noreferrer");
      setExportMsg(
        copied
          ? "Opened TCGPlayer Mass Entry (list copied as backup). Paste only if the form is empty, then Add to Cart, then Optimize Cart."
          : "Opened TCGPlayer Mass Entry. Paste the list below if the cart is empty.",
      );
      return;
    }
    window.open(blankMassEntryUrl(), "_blank", "noopener,noreferrer");
    if (massEntry.withProductId === 0) {
      setExportMsg(
        copied
          ? "List copied. Paste into Mass Entry (One Piece Card Game). No product ids on these cards."
          : "Open Mass Entry, select One Piece Card Game, and paste the list below.",
      );
      return;
    }
    setExportMsg(
      copied
        ? "List too long for a direct link — copied. Paste into Mass Entry, then Add to Cart, then Optimize Cart."
        : "List too long for a direct link. Paste the list below into Mass Entry.",
    );
  }

  const buyInPerson = useMutation({
    mutationFn: async (targets: { cardId: string; prevOwned: number; nextOwned: number; copies: number }[]) => {
      if (!targets.length) {
        throw new Error("Nothing to mark: the selected cards already have enough owned.");
      }
      for (const t of targets) {
        applyOwnedOptimistic(qc, t.cardId, t.nextOwned);
      }
      const results = await Promise.allSettled(
        targets.map((t) => api.setOwned(t.cardId, t.nextOwned)),
      );
      const failed: string[] = [];
      results.forEach((result, i) => {
        if (result.status === "rejected") {
          failed.push(targets[i].cardId);
          applyOwnedOptimistic(qc, targets[i].cardId, targets[i].prevOwned);
        }
      });
      const copies = targets
        .filter((_, i) => results[i].status === "fulfilled")
        .reduce((sum, t) => sum + t.copies, 0);
      const ok = targets.length - failed.length;
      return { ok, failed, copies, done: targets.filter((_, i) => results[i].status === "fulfilled") };
    },
    onSuccess: ({ ok, failed, copies, done }) => {
      invalidateOwnedViews(qc);
      if (ok > 0) setBoughtUndo({ count: ok, targets: done });
      if (failed.length) {
        setExportMsg(
          `Marked ${ok} card${ok === 1 ? "" : "s"} bought in person (${copies} copies). Failed: ${failed.join(", ")}`,
        );
        return;
      }
      setSelectedCardIds(new Set());
      setExportMsg(
        `Marked ${ok} card${ok === 1 ? "" : "s"} bought in person (${copies} copies added to Owned).`,
      );
    },
    onError: (e: Error) => setExportMsg(e.message),
  });

  function onBuyInPerson() {
    const targets = selectedItems
      .filter((item) => item.still_need > 0)
      .map((item) => ({
        cardId: item.card_id,
        prevOwned: item.owned,
        nextOwned: item.owned + item.still_need,
        copies: item.still_need,
      }));
    // The rows keep their place for a moment (green, with Undo) instead of vanishing from the list all at once.
    settled.scope.markBulk(
      targets.map((t) => ({
        id: t.cardId,
        op: { key: "owned", restore: () => restoreOwned(t.cardId, t.prevOwned) },
      })),
    );
    buyInPerson.mutate(targets);
  }

  const [boughtUndo, setBoughtUndo] = useState<{ count: number; targets: { cardId: string; prevOwned: number }[] } | null>(null);
  const dismissBoughtUndo = useCallback(() => setBoughtUndo(null), []);
  async function restoreOwned(cardId: string, prevOwned: number) {
    applyOwnedOptimistic(qc, cardId, prevOwned);
    try {
      await api.setOwned(cardId, prevOwned);
    } catch {
      /* the refresh shows the real count */
    }
    invalidateOwnedViews(qc);
  }
  function undoBought() {
    const undo = boughtUndo;
    setBoughtUndo(null);
    if (!undo) return;
    settled.scope.markBulk(undo.targets.map((t) => ({ id: t.cardId })));
    for (const t of undo.targets) void restoreOwned(t.cardId, t.prevOwned);
  }

  const allVisibleSelected =
    items.length > 0 && items.every((i) => selectedCardIds.has(i.card_id));

  // Count of filters that differ from their defaults, shown on the Filters button.
  const filterBadge =
    (onlyNeed ? 0 : 1) +
    (showDons ? 0 : 1) +
    (showAltArts ? 0 : 1) +
    (sumAcrossLeaders ? 1 : 0) +
    (allDeckIds.length > 0 && activeDeckIds.length < allDeckIds.length ? 1 : 0) +
    (includeExtras ? 0 : 1) +
    (includeCollector ? 0 : 1);

  const createShare = useMutation({
    mutationFn: () =>
      api.createShare({
        kind: "shopping",
        deck_ids: activeDeckIds.length === allDeckIds.length ? undefined : activeDeckIds,
        include_extras: includeExtras,
      }),
    onSuccess: async (info) => {
      await qc.invalidateQueries({ queryKey: qk.share.shopping() });
      const url = `${window.location.origin}${info.path}`;
      setShareMsg((await copyText(url)) ? "Public link copied" : url);
    },
    onError: (e: Error) => setShareMsg(e.message),
  });

  const revokeShare = useMutation({
    mutationFn: (token: string) => api.revokeShare(token),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.share.shopping() });
      setShareMsg("Public link turned off");
    },
    onError: (e: Error) => setShareMsg(e.message),
  });

  const startGroupBuy = useMutation({
    mutationFn: () =>
      api.createGroupBuy({
        title: "Group buy",
        deck_ids: activeDeckIds.length === allDeckIds.length ? undefined : activeDeckIds,
      }),
    onSuccess: async (detail) => {
      await qc.invalidateQueries({ queryKey: qk.groupBuys() });
      navigate(`/group-buys/${detail.id}`);
    },
    onError: (e: Error) => setExportMsg(e.message),
  });

  function selectAllDecks() {
    setSelectedDeckIds(allDeckIds);
    setIncludeExtras(true);
    setIncludeCollector(true);
  }

  function toggleCard(cardId: string) {
    setSelectedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }

  function toggleSelectVisible() {
    setSelectedCardIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const item of items) next.delete(item.card_id);
      } else {
        for (const item of items) next.add(item.card_id);
      }
      return next;
    });
  }

  if (decksQ.error) return <p className="error">{(decksQ.error as Error).message}</p>;
  if (decksQ.isLoading || !filterReady) {
    return <ShoppingListSkeleton />;
  }
  if (isLoading) return <ShoppingListSkeleton />;
  if (error) return <p className="error">{(error as Error).message}</p>;

  const shareInfo = shareQ.data;
  const shareUrl = shareInfo ? `${window.location.origin}${shareInfo.path}` : null;
  const emptyList = allDeckIds.length === 0 && (data?.items.length ?? 0) === 0;

  return (
    <SettledScopeProvider scope={settled.scope}>
    <section className={hasSelection || exportMsg ? "has-buy-dock" : undefined}>
      {settled.liveRegion}
      <div className={`page-head shopping-head${emptyList ? " shopping-head-empty" : ""}`}>
        <div className="shopping-head-title">
          <p className="eyebrow">{allDeckIds.length === 0 ? "Cards you are buying" : "Across your decks"}</p>
          <h1>Master Shopping</h1>
        </div>
        <PriceCheck />
        {!emptyList && (
          <div className="shopping-head-stats">
            <ShoppingStatStrip data={data} />
            <ShoppingBuyButton
              selected={hasSelection}
              massEntry={massEntry}
              busy={buyInPerson.isPending}
              canMarkBought={selectedItems.some((i) => i.still_need > 0)}
              onBuy={() => void onOpenMassEntry()}
              onCopy={() => void onCopyMassEntry()}
              onBuyInPerson={onBuyInPerson}
            />
          </div>
        )}
        <div className="page-head-actions">
          <ShoppingAddPanel deckIds={filterReady && shoppingKey.length < allDeckIds.length ? shoppingKey : undefined} />
          {!emptyList && (
            <>
              <ShoppingSharePanel
                shareInfo={shareInfo}
                shareUrl={shareUrl}
                shareMsg={shareMsg}
                creating={createShare.isPending}
                revoking={revokeShare.isPending}
                onCopy={async () => {
                  if (!shareUrl) return;
                  setShareMsg((await copyText(shareUrl)) ? "Public link copied" : shareUrl);
                }}
                onCreateOrUpdate={() => createShare.mutate()}
                onRevoke={() => {
                  if (shareInfo) revokeShare.mutate(shareInfo.token);
                }}
              />
              <button
                type="button"
                className="btn secondary"
                disabled={startGroupBuy.isPending}
                onClick={() => startGroupBuy.mutate()}
              >
                {startGroupBuy.isPending ? "Starting…" : "Start group buy"}
              </button>
            </>
          )}
        </div>
      </div>

      {emptyList ? (
        <>
          <p className="muted">
            No decks yet. <Link to="/import">Import a deck</Link> to build your shopping list, or use Add cards above.
          </p>
          {/* Price lookup works without any decks — useful before you own a list. */}
          <p className="muted">
            Or{" "}
            <button type="button" className="ghost linkish" onClick={() => setScanOpen(true)}>
              scan a card
            </button>{" "}
            to check its market price.
          </p>
        </>
      ) : (
        <>
      <ShoppingBuyDock
        selection={selectedTotals}
        selected={hasSelection}
        massEntry={massEntry}
        busy={buyInPerson.isPending}
        canMarkBought={selectedItems.some((i) => i.still_need > 0)}
        message={exportMsg}
        onBuy={() => void onOpenMassEntry()}
        onCopy={() => void onCopyMassEntry()}
        onBuyInPerson={onBuyInPerson}
        onClear={() => {
          setSelectedCardIds(new Set());
          setExportMsg(null);
        }}
        onDismissMessage={() => setExportMsg(null)}
      />
      {altOwnedErr && <p className="error">{altOwnedErr}</p>}
      {boughtUndo ? (
        <UndoToast
          message={`Marked ${boughtUndo.count} card${boughtUndo.count === 1 ? "" : "s"} bought`}
          onAction={undoBought}
          onDismiss={dismissBoughtUndo}
        />
      ) : null}
      {collectorUndo ? (
        <UndoToast
          message={`Removed extra ${collectorUndo.label}`}
          onAction={undoCollectorRemove}
          onDismiss={dismissCollectorUndo}
        />
      ) : null}

      <CardWorkspace
        rail={
      <ListToolbar
        search={{ value: search, onChange: setSearch, placeholder: "Filter this list", label: "Filter this list", icon: "filter" }}
        colors={{ selected: colors, onToggle: toggleColor, onClear: () => setColors([]) }}
        types={{ types: typeOptions, value: type, onChange: setTypeChoice }}
        sort={{
          sorts,
          onChange: setSorts,
          onlyNeed,
          unavailableKeys: shoppingUnavailableSorts,
          columnSortKey: COLSORT_SHOPPING_KEY,
          priceHint: "Price is what you still pay for each card, highest first, with picked alt arts at their own price and Extra copies still to buy added.",
        }}
        filterBadge={filterBadge}
        filters={
          <>
            <div className="collection-filter-list">
              <FilterCheck checked={onlyNeed} onChange={setOnlyNeed}>
                To buy only
              </FilterCheck>
              <FilterCheck checked={showDons} onChange={setShowDons}>
                Show DON!!
              </FilterCheck>
              <FilterCheck checked={showAltArts} onChange={setShowAltArts}>
                Show alt arts
              </FilterCheck>
            </div>
            <div className="deck-filter need-mode">
              <HintHeading title="Copies needed" titleId="need-mode-label" label="How copies needed are counted">
                {sumAcrossLeaders
                  ? "Each leader gets its own copies: 4 in a Luffy deck + 3 in a Sabo deck = 7 to buy. Owned copies fill leaders in deck order."
                  : "One set of copies is moved between decks: 4 in a Luffy deck and 3 in a Sabo deck = 4 to buy."}{" "}
                Decks with the same leader always share. Also used for deck pages, your public link and group buys. Only decks ticked under Include decks count on deck pages.
              </HintHeading>
              <div className="layout-toggle" role="radiogroup" aria-labelledby="need-mode-label">
                {(
                  [
                    [false, "Share between leaders"],
                    [true, "Separate per leader"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={label}
                    type="button"
                    role="radio"
                    aria-checked={sumAcrossLeaders === value}
                    className={sumAcrossLeaders === value ? "active" : ""}
                    disabled={!meQ.data || setSumAcrossLeaders.isPending}
                    onClick={() => {
                      if (sumAcrossLeaders !== value) setSumAcrossLeaders.mutate(value);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <DeckIncludeFilter
              heading="Include decks"
              decks={decksQ.data ?? []}
              selectedIds={activeDeckIds}
              onChange={setSelectedDeckIds}
              onSelectAll={selectAllDecks}
              selectAllLabel="Select all"
              otherChips={[
                ...(hasExtras || !includeExtras
                  ? [{ key: "extras", label: "Added directly", checked: includeExtras, onChange: setIncludeExtras }]
                  : []),
                ...(showExtraCopiesChip(hasCollectorWants, includeCollector)
                  ? [{ key: "collector", label: "Extra copies", checked: includeCollector, onChange: setIncludeCollector }]
                  : []),
              ]}
            />
          </>
        }
        layout={layout}
        onLayout={setLayout}
        density={density}
        onDensity={setDensity}
        extras={
          <>
            <PriceCheckToolbarButton />
            <button type="button" className="ghost scan-open" onClick={() => setScanOpen(true)}>
              Scan
            </button>
          </>
        }
      />
        }
      >

      {search.trim() && (
        <p className="search-result-note muted">
          Showing {items.length} match{items.length === 1 ? "" : "es"} for “{search.trim()}”
        </p>
      )}

      <ShoppingItemsView
        items={shownMain}
        layout={layout}
        density={density}
        isNarrow={isNarrow}
        selectedCardIds={selectedCardIds}
        onToggleCard={toggleCard}
        allVisibleSelected={allVisibleSelected}
        onToggleSelectVisible={toggleSelectVisible}
        showAltArts={showAltArts}
        altRow={shoppingAltRow}
        onBuyPick={(cardId, productId, qty) => void changeShoppingAltBuy(cardId, productId, qty)}
        buyBusyKey={altOwnedBusyKey}
        sortingByDeck={sortingByDeck}
        onOwnedSaved={() => invalidateOwnedViews(qc)}
        onRemoveExtra={(id) => removeExtra.mutate(id)}
        removingExtraId={removeExtra.isPending ? (removeExtra.variables ?? null) : null}
        collector={collectorControls}
      />

      {showDons && hasDonsInData && (
        <div className="shopping-don-section">
          <h2 className="don-heading">
            DON!!{shownDons.length ? ` · ${shownDons.length}` : ""}
          </h2>
          {shownDons.length === 0 ? (
            <p className="muted">No DON!! cards match the current filters.</p>
          ) : (
            <ShoppingItemsView
              items={shownDons}
              layout={layout}
              density={density}
              isNarrow={isNarrow}
              selectedCardIds={selectedCardIds}
              onToggleCard={toggleCard}
              allVisibleSelected={allVisibleSelected}
              onToggleSelectVisible={toggleSelectVisible}
              showAltArts={showAltArts}
              altRow={shoppingAltRow}
              sortingByDeck={sortingByDeck}
              onOwnedSaved={() => invalidateOwnedViews(qc)}
              onRemoveExtra={(id) => removeExtra.mutate(id)}
              removingExtraId={removeExtra.isPending ? (removeExtra.variables ?? null) : null}
              collector={collectorControls}
            />
          )}
        </div>
      )}
      </CardWorkspace>
        </>
      )}
      {/* Confirms the page is receiving the drag, so a failure is legible as
          "not accepted" rather than "nothing happened". */}
      {pageDragging && !scanOpen && (
        <div className="page-drop-hint" role="status">
          Drop the card image to scan it
        </div>
      )}
      {scanOpen && (
        <CardScanner
          items={data?.items ?? []}
          initialImage={droppedImage}
          multi={{
            target: "shopping",
            onAdded: () => {
              settled.scope.holdAll();
              invalidateOwnedViews(qc);
            },
          }}
          renderHitAction={(card) => <ShoppingScanHitAction cardId={card.card_id} />}
          onClose={() => {
            // Whatever the scan changed shows up under the dialog: hold it a moment so the list settles in view.
            settled.scope.holdAll();
            setScanOpen(false);
            setDroppedImage(null);
          }}
        />
      )}
    </section>
    </SettledScopeProvider>
  );
}
