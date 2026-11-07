import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, CollectorLine, money, needBreakdownLabel, ShoppingItem, User } from "../../api";
import { blankMassEntryUrl, buildMassEntryExport } from "../../tcgplayerMassEntry";
import { shoppingShownPrice } from "../../deckCost";
import { UndoToast } from "../../CollectorLine";
import { collectorSelectKey, itemNeedsCopies } from "../../collectorLines";
import { meQueryKey, useMe } from "../../auth/useMe";
import { CardLayoutToggle, useCardLayout } from "../../CardLayout";
import {
  CardSearchInput,
  CollapsibleFilters,
  compareCardOrder,
  matchesCardSearch,
  SORT_LABELS,
  SortMenu,
  useCardSorts,
  usePersistedOpen,
  useShowAltArts,
  type SortKey,
} from "../../cardListControls";
import { loadShoppingDeckFilter, saveShoppingDeckFilter } from "../../shoppingDeckFilter";
import { invalidateOwnedViews } from "../../ownedCollection";
import { CardScanner } from "../../lazyPages";
import { useImageDrop } from "../../useImageDrop";
import { baseTileFor, shownProductId } from "../../altArt";
import { useCardEdits } from "../../cache/useCardEdits";
import { busyKeyFor } from "../../cache/busyKey";
import { AltArtsRow } from "../../MarketPrice";
import { ShoppingListSkeleton } from "../../Skeleton";
import { useNarrowLayout } from "../../useNarrowLayout";
import { useFullShoppingById, ShoppingScanHitAction } from "./lightboxActions";
import { invalidateAltWantViews, invalidateCollectorViews } from "../../cache/invalidate";
import {
  applyAltBuyOptimistic,
  applyCollectorOptimistic,
  applyOwnedOptimistic,
} from "../../cache/optimistic";
import { type CollectorControls, ShoppingItemsView } from "./ShoppingItemsView";
import { OwnedInput } from "../OwnedInputs";
import { isDonCard } from "../../donCards";
import { ShoppingStatStrip } from "./shoppingStats";
import { ShoppingSharePanel } from "../SharePanels";
import { ShoppingAddPanel } from "./ShoppingAddPanel";

const SHOPPING_SELECTED_KEY = "optcg_shopping_selected_cards";

const SHOW_SHOPPING_DONS_KEY = "optcg_show_shopping_dons";

const SHOPPING_EXTRAS_KEY = "optcg_shopping_include_extras";

const SHOPPING_ONLY_NEED_KEY = "optcg_shopping_only_need";

function loadSelectedCardIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SHOPPING_SELECTED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function loadShowShoppingDons(): boolean {
  try {
    const raw = localStorage.getItem(SHOW_SHOPPING_DONS_KEY);
    if (raw === null) return true;
    return raw === "1";
  } catch {
    return true;
  }
}

export function ShoppingPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const isNarrow = useNarrowLayout();
  const decksQ = useQuery({ queryKey: ["decks"], queryFn: api.decks });
  const allDeckIds = useMemo(() => (decksQ.data ?? []).map((d) => d.id), [decksQ.data]);
  const [selectedDeckIds, setSelectedDeckIds] = useState<number[] | null>(null);
  const [filterReady, setFilterReady] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(() => loadSelectedCardIds());
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
    if (!filterReady || selectedDeckIds === null) return;
    saveShoppingDeckFilter(selectedDeckIds);
  }, [selectedDeckIds, filterReady]);

  useEffect(() => {
    try {
      localStorage.setItem(SHOPPING_SELECTED_KEY, JSON.stringify([...selectedCardIds]));
    } catch {
      /* ignore */
    }
  }, [selectedCardIds]);

  const activeDeckIds = selectedDeckIds ?? allDeckIds;
  const shoppingKey = useMemo(
    () => [...activeDeckIds].sort((a, b) => a - b),
    [activeDeckIds],
  );

  const [includeExtras, setIncludeExtras] = usePersistedOpen(SHOPPING_EXTRAS_KEY, true);
  const { data, isLoading, error } = useQuery({
    queryKey: ["shopping", shoppingKey, includeExtras],
    queryFn: () =>
      api.shopping(shoppingKey.length ? shoppingKey : undefined, { extras: includeExtras }),
    // Runs with zero decks too: cards added directly make a list on their own.
    enabled: filterReady,
  });
  // Unfiltered list: tells whether any card was added directly even while hidden by the filter.
  const fullShoppingById = useFullShoppingById();
  const hasExtras = useMemo(
    () => [...fullShoppingById.values()].some((i) => (i.extra_qty ?? 0) > 0),
    [fullShoppingById],
  );
  const removeExtra = useMutation({
    mutationFn: (cardId: string) => api.setShoppingExtra(cardId, 0),
    onSuccess: () => invalidateOwnedViews(qc),
  });
  const shareQ = useQuery({
    queryKey: ["share", "shopping"],
    queryFn: api.getShoppingShare,
    enabled: filterReady,
  });
  const meQ = useMe();
  const sumAcrossLeaders = Boolean(meQ.data?.sum_across_leaders);
  const setSumAcrossLeaders = useMutation({
    mutationFn: (value: boolean) => api.updatePreferences({ sum_across_leaders: value }),
    onMutate: (value) => {
      const prev = qc.getQueryData<User | null>(meQueryKey);
      qc.setQueryData<User | null>(meQueryKey, (old) =>
        old ? { ...old, sum_across_leaders: value } : old,
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(meQueryKey, ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: meQueryKey });
      invalidateAltWantViews(qc);
    },
  });
  const [onlyNeed, setOnlyNeed] = usePersistedOpen(SHOPPING_ONLY_NEED_KEY, true);
  const [showDons, setShowDons] = useState(loadShowShoppingDons);
  const shoppingUnavailableSorts = useMemo(() => ["user"] as SortKey[], []);
  const { sorts, setSorts, effectiveSorts } = useCardSorts(onlyNeed, shoppingUnavailableSorts);
  const [showAltArts, setShowAltArts] = useShowAltArts();
  const [layout, setLayout] = useCardLayout();
  const [search, setSearch] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [droppedImage, setDroppedImage] = useState<Blob | null>(null);
  const [pageDragging, setPageDragging] = useState(false);
  // Dropping a card image anywhere on this page opens the scanner, so the
  // dialog does not have to be open first for drag-and-drop to work.
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
    changeDisplayArt: changeShoppingDisplayArt,
    busyProductId: altOwnedBusyProductId,
  } = useCardEdits({
    saveAltBuy: async (cardId, productId, qty) => {
      // Same deck filter the shopping list is read with, so the pick lands on the decks shown.
      const deckIds = activeDeckIds.length === allDeckIds.length ? undefined : activeDeckIds;
      const res = await api.setCardPrinting(cardId, productId, qty, deckIds);
      applyAltBuyOptimistic(qc, cardId, productId, res.qty);
    },
  });
  const sortingByDeck = effectiveSorts.includes("deck");

  useEffect(() => {
    try {
      localStorage.setItem(SHOW_SHOPPING_DONS_KEY, showDons ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [showDons]);

  const [collectorBusyKey, setCollectorBusyKey] = useState<string | null>(null);
  const [collectorUndo, setCollectorUndo] = useState<{ cardId: string; productId: number; qty: number; label: string } | null>(null);
  const dismissCollectorUndo = useCallback(() => setCollectorUndo(null), []);

  const changeCollector = async (cardId: string, productId: number, qty: number) => {
    setAltOwnedErr(null);
    setCollectorBusyKey(busyKeyFor(cardId, productId));
    applyCollectorOptimistic(qc, cardId, productId, qty);
    try {
      const res = await api.setCollectorWant(cardId, productId, qty);
      applyCollectorOptimistic(qc, cardId, productId, res.qty);
    } catch (e) {
      setAltOwnedErr((e as Error).message);
    } finally {
      invalidateCollectorViews(qc);
      setCollectorBusyKey(null);
    }
  };

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
      onOwnedChange={(productId, qty) => void changeShoppingAltOwned(item.card_id, productId, qty)}
      showBuyPicks={item.still_need > 0}
      shownProductId={shownProductId(item)}
      onShow={(productId) => void changeShoppingDisplayArt(item.card_id, productId)}
      busyProductId={altOwnedBusyProductId(item.card_id)}
    />
  );

  const filteredItems = useMemo(() => {
    let list = data?.items ?? [];
    if (onlyNeed) list = list.filter(itemNeedsCopies);
    if (search.trim()) list = list.filter((i) => matchesCardSearch(i, search));
    list = [...list].sort((a, b) => compareCardOrder({ ...a, market_price: shoppingShownPrice(a) }, { ...b, market_price: shoppingShownPrice(b) }, effectiveSorts));
    return list;
  }, [data, onlyNeed, effectiveSorts, search]);

  const mainItems = useMemo(() => filteredItems.filter((i) => !isDonCard(i)), [filteredItems]);
  const donItems = useMemo(() => filteredItems.filter((i) => isDonCard(i)), [filteredItems]);
  const hasDonsInData = useMemo(() => (data?.items ?? []).some(isDonCard), [data]);
  const items = useMemo(
    () => (showDons ? [...mainItems, ...donItems] : mainItems),
    [mainItems, donItems, showDons],
  );

  const selectedItems = useMemo(() => {
    const byId = new Map((data?.items ?? []).map((i) => [i.card_id, i]));
    const list: ShoppingItem[] = [];
    for (const id of selectedCardIds) {
      const item = byId.get(id);
      if (item) list.push(item);
    }
    return list;
  }, [data, selectedCardIds]);

  const selectedCollectorLines = useMemo(() => {
    const out: { item: ShoppingItem; line: CollectorLine }[] = [];
    for (const item of data?.items ?? []) {
      for (const line of item.collector_wants ?? []) {
        if (selectedCardIds.has(collectorSelectKey(item.card_id, line.product_id))) out.push({ item, line });
      }
    }
    return out;
  }, [data, selectedCardIds]);

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

  // Selected collector lines go to Mass Entry as their own printing; Buy in person only adds base copies, so it skips them.
  const massEntry = useMemo(
    () =>
      buildMassEntryExport([
        ...selectedItems,
        ...selectedCollectorLines.map(({ item, line }) => ({
          card_id: item.card_id,
          name: `${item.name} (${line.label})`,
          still_need: line.still_need,
          product_id: line.product_id,
        })),
      ]),
    [selectedItems, selectedCollectorLines],
  );

  async function copyMassEntryList(): Promise<boolean> {
    if (!massEntry.pasteText) {
      setExportMsg("Nothing to export — selected cards need copies.");
      return false;
    }
    try {
      await navigator.clipboard.writeText(massEntry.pasteText);
      return true;
    } catch {
      setExportMsg(massEntry.pasteText);
      return false;
    }
  }

  async function onCopyMassEntry() {
    const ok = await copyMassEntryList();
    if (!ok) return;
    const missing =
      massEntry.missingProductId > 0
        ? ` · ${massEntry.missingProductId} without product id (name fallback)`
        : "";
    setExportMsg(
      `Copied ${massEntry.includedCount} card${massEntry.includedCount === 1 ? "" : "s"} (${massEntry.copyCount} copies) for TCGPlayer Mass Entry${missing}`,
    );
  }

  async function onOpenMassEntry() {
    if (!massEntry.pasteText) {
      setExportMsg("Nothing to export — selected cards need copies.");
      return;
    }
    const copied = await copyMassEntryList();
    if (massEntry.url) {
      window.open(massEntry.url, "_blank", "noopener,noreferrer");
      setExportMsg(
        copied
          ? "Opened TCGPlayer Mass Entry (list copied as backup). Paste only if the form is empty, then Add to Cart → Optimize Cart."
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
        ? "List too long for a direct link — copied. Paste into Mass Entry, then Add to Cart → Optimize Cart."
        : "List too long for a direct link. Paste the list below into Mass Entry.",
    );
  }

  const buyInPerson = useMutation({
    mutationFn: async (targets: { cardId: string; prevOwned: number; nextOwned: number; copies: number }[]) => {
      if (!targets.length) {
        throw new Error("Nothing to mark — selected cards already have enough owned.");
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
      return { ok, failed, copies };
    },
    onSuccess: ({ ok, failed, copies }) => {
      invalidateOwnedViews(qc);
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
    buyInPerson.mutate(targets);
  }

  const allVisibleSelected =
    items.length > 0 && items.every((i) => selectedCardIds.has(i.card_id));

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (onlyNeed) parts.push("Still need");
    if (showDons) parts.push("DON!!");
    if (effectiveSorts.length) parts.push(effectiveSorts.map((k) => SORT_LABELS[k]).join(" › "));
    if (showAltArts) parts.push("Alt arts");
    if (layout === "grid") parts.push("Grid");
    if (sumAcrossLeaders) parts.push("Separate per leader");
    if (allDeckIds.length > 0 && activeDeckIds.length < allDeckIds.length) {
      parts.push(`${activeDeckIds.length}/${allDeckIds.length} decks`);
    }
    if (!includeExtras) parts.push("No added cards");
    return parts.join(" · ");
  }, [
    onlyNeed,
    showDons,
    effectiveSorts,
    showAltArts,
    layout,
    sumAcrossLeaders,
    activeDeckIds.length,
    allDeckIds.length,
    includeExtras,
  ]);

  const createShare = useMutation({
    mutationFn: () =>
      api.createShare({
        kind: "shopping",
        deck_ids: activeDeckIds.length === allDeckIds.length ? undefined : activeDeckIds,
        include_extras: includeExtras,
      }),
    onSuccess: async (info) => {
      await qc.invalidateQueries({ queryKey: ["share", "shopping"] });
      const url = `${window.location.origin}${info.path}`;
      try {
        await navigator.clipboard.writeText(url);
        setShareMsg("Public link copied");
      } catch {
        setShareMsg(url);
      }
    },
    onError: (e: Error) => setShareMsg(e.message),
  });

  const revokeShare = useMutation({
    mutationFn: (token: string) => api.revokeShare(token),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["share", "shopping"] });
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
      await qc.invalidateQueries({ queryKey: ["group-buys"] });
      navigate(`/group-buys/${detail.id}`);
    },
    onError: (e: Error) => setExportMsg(e.message),
  });

  /** Everything on the "Used in" line besides the deck names (those render as chips). */
  function usedInNote(item: ShoppingItem): string {
    const parts: string[] = [];
    const breakdown = needBreakdownLabel(item);
    if ((item.leader_count ?? 1) > 1) {
      const primary = item.primary_leader_name || item.primary_leader_card_id || "earliest deck";
      // The breakdown already says the card is shared; the sort note only
      // matters when grouping by deck.
      if (!breakdown) parts.push(`shared (sorted under ${primary})`);
      else parts.push(sortingByDeck ? `${breakdown} · sorted under ${primary}` : breakdown);
    } else if (breakdown) {
      parts.push(breakdown);
    } else if (sortingByDeck && item.primary_leader_name) {
      parts.push(item.primary_leader_name);
    }
    const extra = item.extra_qty ?? 0;
    if (extra > 0) {
      parts.push("Added directly");
    }
    return parts.join(" · ");
  }

  function toggleDeck(id: number) {
    setSelectedDeckIds((prev) => {
      const current = prev ?? allDeckIds;
      if (current.includes(id)) {
        const next = current.filter((x) => x !== id);
        return next.length ? next : current;
      }
      return [...current, id];
    });
  }

  function selectAllDecks() {
    setSelectedDeckIds(allDeckIds);
    setIncludeExtras(true);
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
  // No decks and nothing added directly: only the search drawer and a hint.
  const emptyList = allDeckIds.length === 0 && (data?.items.length ?? 0) === 0;

  return (
    <section>
      <div className="page-head">
        <div>
          <p className="eyebrow">{allDeckIds.length === 0 ? "Cards you are buying" : "Across your decks"}</p>
          <h1>Master Shopping</h1>
          {!emptyList && <ShoppingStatStrip data={data} />}
        </div>
        {!emptyList && (
        <div className="page-head-actions">
          <ShoppingSharePanel
            shareInfo={shareInfo}
            shareUrl={shareUrl}
            shareMsg={shareMsg}
            creating={createShare.isPending}
            revoking={revokeShare.isPending}
            onCopy={async () => {
              if (!shareUrl) return;
              try {
                await navigator.clipboard.writeText(shareUrl);
                setShareMsg("Public link copied");
              } catch {
                setShareMsg(shareUrl);
              }
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
        </div>
        )}
      </div>

      <ShoppingAddPanel
        defaultOpen={(data?.items.length ?? 0) === 0}
        deckIds={filterReady && shoppingKey.length < allDeckIds.length ? shoppingKey : undefined}
      />

      {emptyList ? (
        <>
          <p className="muted">
            No decks yet. <Link to="/import">Import a deck</Link> to build your shopping list, or add cards above.
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
      {selectedTotals.count > 0 && (
        <div className="buy-bar">
          <div className="buy-bar-summary">
            <div>
              <strong>
                {selectedTotals.count} card{selectedTotals.count === 1 ? "" : "s"} selected
              </strong>
              <span className="muted">
                {" "}
                · {selectedTotals.copies} still needed · {money(selectedTotals.total)}
                {selectedTotals.priced < selectedTotals.count ? " (priced cards only)" : ""}
              </span>
            </div>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setSelectedCardIds(new Set());
                setExportMsg(null);
              }}
            >
              Clear
            </button>
          </div>
          <div className="buy-bar-actions">
            <button
              type="button"
              className="btn secondary"
              disabled={massEntry.includedCount === 0 || buyInPerson.isPending}
              onClick={() => void onCopyMassEntry()}
            >
              Copy for TCGPlayer
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={massEntry.includedCount === 0 || buyInPerson.isPending}
              onClick={() => void onOpenMassEntry()}
            >
              Open Mass Entry
            </button>
            <button
              type="button"
              className="btn secondary"
              disabled={!selectedItems.some((i) => i.still_need > 0) || buyInPerson.isPending}
              onClick={onBuyInPerson}
            >
              {buyInPerson.isPending ? "Updating…" : "Buying in person"}
            </button>
          </div>
          {exportMsg ? (
            <p className="buy-bar-msg" role="status">
              {exportMsg}
            </p>
          ) : null}
        </div>
      )}
      {selectedTotals.count === 0 && exportMsg ? (
        <p className="buy-bar-msg buy-bar-msg-solo" role="status">
          {exportMsg}
        </p>
      ) : null}
      {altOwnedErr && <p className="error">{altOwnedErr}</p>}
      {collectorUndo ? (
        <UndoToast
          message={`Removed ${collectorUndo.label} collector copy`}
          onAction={undoCollectorRemove}
          onDismiss={dismissCollectorUndo}
        />
      ) : null}

      <div className="list-toolbar">
        <div className="list-toolbar-row">
          <CardSearchInput value={search} onChange={setSearch} />
          <button type="button" className="ghost scan-open" onClick={() => setScanOpen(true)}>
            Scan
          </button>
          <CardLayoutToggle layout={layout} onChange={setLayout} />
        </div>
        <CollapsibleFilters summary={filterSummary}>
          <div className="filters">
            <label>
              <input type="checkbox" checked={onlyNeed} onChange={(e) => setOnlyNeed(e.target.checked)} />
              Still need only
            </label>
            <label>
              <input type="checkbox" checked={showDons} onChange={(e) => setShowDons(e.target.checked)} />
              Show DON!!
            </label>
            <SortMenu
              sorts={sorts}
              onChange={setSorts}
              onlyNeed={onlyNeed}
              unavailableKeys={shoppingUnavailableSorts}
              columnSortKey="optcg_colsort_shopping"
              priceHint="Price is what you still pay for each card, highest first, with picked alt arts at their own price."
            />
            <label>
              <input
                type="checkbox"
                checked={showAltArts}
                onChange={(e) => setShowAltArts(e.target.checked)}
              />
              Show alt arts
            </label>
          </div>
          <div className="deck-filter need-mode">
            <div className="deck-filter-head">
              <span id="need-mode-label">Copies needed</span>
            </div>
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
            <p className="need-mode-note muted">
              {sumAcrossLeaders
                ? "Each leader gets its own copies: 4 in a Luffy deck + 3 in a Sabo deck = 7 to buy. Owned copies fill leaders in deck order."
                : "One set of copies is moved between decks: 4 in a Luffy deck and 3 in a Sabo deck = 4 to buy."}{" "}
              Decks with the same leader always share. Also used for deck pages, your public link and group buys. Only decks ticked under Include decks count on deck pages.
            </p>
          </div>
          {sortingByDeck && (
            <p className="sort-deck-note muted">
              Deck sort groups cards by leader (deck list order). Cards used by multiple leaders stay under
              their earliest deck&apos;s leader.
            </p>
          )}
          <div className="deck-filter">
            <div className="deck-filter-head">
              <span>Include decks</span>
              <button type="button" className="ghost" onClick={selectAllDecks}>
                Select all
              </button>
            </div>
            <div className="deck-filter-list">
              {(decksQ.data ?? []).map((d) => (
                <label key={d.id} className="deck-chip">
                  <input
                    type="checkbox"
                    checked={activeDeckIds.includes(d.id)}
                    onChange={() => toggleDeck(d.id)}
                  />
                  {d.name}
                </label>
              ))}
              {(hasExtras || !includeExtras) && (
                <label className="deck-chip">
                  <input
                    type="checkbox"
                    checked={includeExtras}
                    onChange={(e) => setIncludeExtras(e.target.checked)}
                  />
                  Added directly
                </label>
              )}
            </div>
          </div>
        </CollapsibleFilters>
      </div>

      {search.trim() && (
        <p className="search-result-note muted">
          Showing {items.length} match{items.length === 1 ? "" : "es"} for “{search.trim()}”
        </p>
      )}

      <ShoppingItemsView
        items={mainItems}
        layout={layout}
        isNarrow={isNarrow}
        selectedCardIds={selectedCardIds}
        onToggleCard={toggleCard}
        allVisibleSelected={allVisibleSelected}
        onToggleSelectVisible={toggleSelectVisible}
        showAltArts={showAltArts}
        altRow={shoppingAltRow}
        onBuyPick={(cardId, productId, qty) => void changeShoppingAltBuy(cardId, productId, qty)}
        buyBusyKey={altOwnedBusyKey}
        usedInNote={usedInNote}
        onOwnedSaved={() => invalidateOwnedViews(qc)}
        onRemoveExtra={(id) => removeExtra.mutate(id)}
        removingExtraId={removeExtra.isPending ? (removeExtra.variables ?? null) : null}
        collector={collectorControls}
      />

      {showDons && hasDonsInData && (
        <div className="shopping-don-section">
          <h2 className="don-heading">
            DON!!{donItems.length ? ` · ${donItems.length}` : ""}
          </h2>
          {donItems.length === 0 ? (
            <p className="muted">No DON!! cards match the current filters.</p>
          ) : (
            <ShoppingItemsView
              items={donItems}
              layout={layout}
              isNarrow={isNarrow}
              selectedCardIds={selectedCardIds}
              onToggleCard={toggleCard}
              allVisibleSelected={allVisibleSelected}
              onToggleSelectVisible={toggleSelectVisible}
              showAltArts={showAltArts}
              altRow={shoppingAltRow}
              usedInNote={usedInNote}
              onOwnedSaved={() => invalidateOwnedViews(qc)}
              onRemoveExtra={(id) => removeExtra.mutate(id)}
              removingExtraId={removeExtra.isPending ? (removeExtra.variables ?? null) : null}
              collector={collectorControls}
            />
          )}
        </div>
      )}
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
          multi={{ target: "shopping", onAdded: () => invalidateOwnedViews(qc) }}
          renderHitAction={(card) => <ShoppingScanHitAction cardId={card.card_id} />}
          onClose={() => {
            setScanOpen(false);
            setDroppedImage(null);
          }}
        />
      )}
    </section>
  );
}
