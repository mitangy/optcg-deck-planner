import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api, CardView, DeckDetail } from "../../api";
import { buildOptcgSimExport, downloadTextFile, optcgSimFilename } from "../shopping/optcgsimExport";
import { duelPlayUrl } from "../../app/duelLink";
import {
  hintAsk,
  useLogPoseAsk,
  useLogPoseDeckEditor,
  useLogPosePage,
  type DeckEditor,
} from "@optcg/analyst-client";
import { applyPlannerEdit, plannerDeckContext, plannerDeckPage } from "./logPose";
import { CardLayoutToggle, useCardLayout } from "../../ui/CardLayout";
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
} from "../../ui/cardListControls";
import { useSavedShoppingDeckIds } from "../shopping/shoppingDeckFilter";
import { invalidateOwnedViews } from "../collection/ownedCollection";
import { useMediaQuery } from "@optcg/ui/hooks";
import { DOCK_QUERY, DeckStatsDock } from "./DeckStats";
import { type DeckHint } from "@optcg/deck-analytics";
import { useDeckHints } from "@optcg/deck-analytics/ui";
import { MenuItem } from "@optcg/ui/popups";
import { HeadMenu, HeadPopover, MoreIcon, ShareIcon } from "../../ui/HeadPopover";
import { ReplaceDeckListDialog } from "./ReplaceDeckListDialog";
import { HideFromFriendsItem } from "../../friends/HideFromFriends";
import { CardArtImg } from "../../ui/CardThumb";
import { useCardEdits } from "../../cache/useCardEdits";
import { DeckDetailSkeleton } from "../../ui/Skeleton";
import { invalidateAltWantViews } from "../../cache/invalidate";
import { setDeckCardNeeded, MAIN_DECK_LIMIT, DON_DECK_LIMIT } from "./deckEditing";
import { isDonCardType } from "../../cards/donCards";
import { DeckSharePanel, DeckExportPanel } from "../SharePanels";
import { DeckEditorPanel } from "./DeckEditorPanel";
import { DeckProgressSummary } from "./DeckProgressSummary";
import { CardTable } from "./CardTable";
import { AvailableDonSection } from "./AvailableDonSection";
import { COLSORT_DECK_KEY, DECK_ONLY_NEED_KEY } from "../../storage/keys";
import { qk } from "../../cache/queryKeys";

function filterCards(
  cards: CardView[],
  onlyNeed: boolean,
  sorts: SortKey[],
  search = "",
): CardView[] {
  let list = cards;
  if (onlyNeed) list = list.filter((c) => c.still_need > 0);
  if (search.trim()) list = list.filter((c) => matchesCardSearch(c, search));
  return [...list].sort((a, b) => compareCardOrder(a, b, sorts));
}

/** Error state for a page-level fetch: message plus a Retry that keeps its size while refetching. */
function LoadErrorBlock({ title, message, retrying, onRetry }: { title: string; message: string; retrying: boolean; onRetry: () => void }) {
  return (
    <div className="load-error" role="alert">
      <div className="load-error-text">
        <strong>{title}</strong>
        <p className="muted">{message}</p>
      </div>
      <button type="button" className="btn secondary load-error-retry" disabled={retrying} aria-busy={retrying} onClick={onRetry}>
        {retrying ? "Retrying…" : "Retry"}
      </button>
    </div>
  );
}

export function DeckDetailPage() {
  const { id } = useParams();
  const deckId = Number(id);
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const savedDeckIds = useSavedShoppingDeckIds();
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: qk.deck.detail(deckId, savedDeckIds),
    queryFn: () => api.deck(deckId, savedDeckIds),
    enabled: Number.isFinite(deckId),
  });
  // A failed deck query with no data goes back to "pending" while Retry refetches; remember the
  // error so the block stays on screen (Retry disabled) instead of flashing the skeleton.
  const lastError = useRef<Error | null>(null);
  if (error) lastError.current = error as Error;
  else if (data) lastError.current = null;
  const [onlyNeed, setOnlyNeed] = usePersistedOpen(DECK_ONLY_NEED_KEY, true);
  const deckUnavailableSorts = useMemo(() => ["deck", "user"] as SortKey[], []);
  const { sorts, setSorts, effectiveSorts } = useCardSorts(onlyNeed, deckUnavailableSorts);
  const [showAltArts, setShowAltArts] = useShowAltArts();
  const [layout, setLayout] = useCardLayout();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(() => searchParams.get("edit") === "1");
  // Wide enough for the dock column: the editor takes that column (sticky) while editing, stats move to the pill.
  const sideEdit = useMediaQuery(DOCK_QUERY) && editing;
  const [rowFlash, setRowFlash] = useState<{ id: string; n: number } | null>(null);
  useEffect(() => {
    if (!rowFlash) return;
    const el = Array.from(document.querySelectorAll<HTMLElement>("[data-card-id]")).find(
      (e) => e.dataset.cardId === rowFlash.id && e.offsetParent !== null,
    );
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (sideEdit && (r.top < 0 || r.bottom > window.innerHeight)) {
      const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ block: "nearest", behavior: calm ? "auto" : "smooth" });
    }
    el.classList.remove("row-flash");
    void el.offsetWidth;
    el.classList.add("row-flash");
    const t = window.setTimeout(() => el.classList.remove("row-flash"), 1400);
    return () => window.clearTimeout(t);
  }, [rowFlash, sideEdit]);
  const [neededBusyId, setNeededBusyId] = useState<string | null>(null);
  const [neededErr, setNeededErr] = useState<string | null>(null);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameText, setRenameText] = useState("");
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const shareDeck = useMutation({
    mutationFn: () => api.createShare({ kind: "deck", deck_id: deckId }),
    onSuccess: async (info) => {
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

  const logPoseDeck = useMemo(() => (data ? plannerDeckContext(data) : null), [data]);
  useLogPosePage(logPoseDeck ? plannerDeckPage(logPoseDeck) : null);

  const optcgSimExport = useMemo(() => {
    if (!data) return null;
    return buildOptcgSimExport(data.cards, { leaderCardId: data.leader_card_id });
  }, [data]);

  const copyOptcgSimList = async () => {
    if (!optcgSimExport || !optcgSimExport.pasteText) {
      setExportMsg("Nothing to export — add main-deck cards first.");
      return;
    }
    try {
      await navigator.clipboard.writeText(optcgSimExport.pasteText);
      setExportMsg(
        `Copied ${optcgSimExport.lineCount} line${optcgSimExport.lineCount === 1 ? "" : "s"} for OPTCGSim`,
      );
    } catch {
      setExportMsg("Could not copy — try Download .txt instead.");
    }
  };

  const downloadOptcgSimList = () => {
    if (!data || !optcgSimExport || !optcgSimExport.pasteText) {
      setExportMsg("Nothing to export — add main-deck cards first.");
      return;
    }
    downloadTextFile(optcgSimExport.pasteText, optcgSimFilename(data.name));
    setExportMsg(
      `Downloaded ${optcgSimExport.lineCount} line${optcgSimExport.lineCount === 1 ? "" : "s"} for OPTCGSim`,
    );
  };

  const applyDeckUpdate = (detail: DeckDetail) => {
    // The response counts every deck's claims; with Include decks narrowed, refetch the filtered view.
    if (savedDeckIds) void qc.invalidateQueries({ queryKey: qk.deck.byId(deckId) });
    else qc.setQueryData(qk.deck.byId(deckId), detail);
    invalidateAltWantViews(qc);
  };

  // Log Pose's Apply card: what is owned (for the chips) and how this page saves a suggested change.
  const { data: ownedData } = useQuery({ queryKey: qk.owned.all(), queryFn: () => api.ownedCollection(), staleTime: 300_000 });
  const logPoseEditor = useMemo<DeckEditor | null>(() => {
    if (!data || !logPoseDeck) return null;
    const ownedById = new Map((ownedData?.items ?? []).map((i) => [i.card_id.toUpperCase(), i.owned]));
    return {
      ref: `planner:${data.id}`,
      cards: logPoseDeck.cards,
      owned: (id) => data.cards.find((c) => c.card_id === id)?.owned ?? ownedById.get(id) ?? (ownedData ? 0 : undefined),
      apply: async (ops) => {
        try {
          const detail = await applyPlannerEdit((cardId, needed) => setDeckCardNeeded(deckId, cardId, needed), ops);
          if (detail) applyDeckUpdate(detail);
        } catch (e) {
          // A rollback may have run: show the deck as the server has it.
          void qc.invalidateQueries({ queryKey: qk.deck.byId(deckId) });
          throw e;
        }
      },
    };
  }, [data, logPoseDeck, ownedData, deckId, qc]);
  useLogPoseDeckEditor(logPoseEditor);

  const changeNeeded = async (cardId: string, needed: number) => {
    setNeededErr(null);
    setNeededBusyId(cardId);
    try {
      const detail = await setDeckCardNeeded(deckId, cardId, needed);
      if (detail) applyDeckUpdate(detail);
    } catch (e) {
      setNeededErr((e as Error).message);
    } finally {
      setNeededBusyId(null);
    }
  };

  const {
    busyKey: altOwnedBusyKey,
    error: altOwnedErr,
    changeAltOwned,
    changeAltBuy,
    changeCollector,
    collectorBusyKey,
    changeDisplayArt,
  } = useCardEdits({
    saveAltBuy: async (cardId, productId, qty) => {
      const detail = await api.setDeckCardPrinting(deckId, cardId, productId, qty);
      applyDeckUpdate(detail);
    },
  });

  const resetOwned = useMutation({
    mutationFn: () => api.resetDeckOwned(deckId),
    onSuccess: (res) => {
      applyDeckUpdate(res.deck);
      invalidateOwnedViews(qc);
      setResetMsg(
        res.reset_count === 0
          ? "Owned counts were already 0 for this deck"
          : `Reset owned on ${res.reset_count} card${res.reset_count === 1 ? "" : "s"}`,
      );
    },
    onError: (e: Error) => setResetMsg(e.message),
  });

  const rename = useMutation({
    mutationFn: (name: string) => api.renameDeck(deckId, name),
    onSuccess: (detail) => {
      applyDeckUpdate(detail);
      setRenaming(false);
      void qc.invalidateQueries({ queryKey: qk.decks() });
      // Same-leader decks list this one by name under "Compared to Main".
      void qc.invalidateQueries({ queryKey: qk.deck.all() });
    },
  });
  const submitRename = () => {
    const name = renameText.trim();
    if (!name || rename.isPending) return;
    if (name === data?.name) {
      setRenaming(false);
      return;
    }
    rename.mutate(name);
  };
  const cancelRename = () => {
    rename.reset();
    setRenaming(false);
  };

  const setMain = useMutation({
    mutationFn: () => api.setDeckAsMain(deckId),
    onSuccess: (detail) => {
      applyDeckUpdate(detail);
      void qc.invalidateQueries({ queryKey: qk.decks() });
      void qc.invalidateQueries({ queryKey: qk.deck.all() });
    },
  });

  const main = useMemo(() => {
    if (!data) return [];
    return filterCards(
      data.cards.filter((c) => c.section !== "additional" && c.section !== "don"),
      onlyNeed,
      effectiveSorts,
      search,
    );
  }, [data, onlyNeed, effectiveSorts, search]);

  const additional = useMemo(() => {
    if (!data) return [];
    return filterCards(
      data.cards.filter((c) => c.section === "additional"),
      onlyNeed,
      effectiveSorts,
      search,
    );
  }, [data, onlyNeed, effectiveSorts, search]);

  const donCards = useMemo(() => {
    if (!data) return [];
    return filterCards(
      data.cards.filter((c) => c.section === "don" || isDonCardType(c.card_type)),
      onlyNeed,
      effectiveSorts,
      search,
    );
  }, [data, onlyNeed, effectiveSorts, search]);

  const hasDonInDeck = useMemo(() => {
    if (!data) return false;
    return data.cards.some((c) => c.section === "don" || isDonCardType(c.card_type));
  }, [data]);

  const progressCards = useMemo(() => {
    if (!data) return [];
    return data.cards.filter((c) => c.section !== "don" && !isDonCardType(c.card_type));
  }, [data]);
  const statsCards = useMemo(
    () => progressCards.map((c) => ({ id: c.card_id, copies: c.needed })),
    [progressCards],
  );
  // While editing the 50-card count stays quiet; once the user is done (or just viewing) it is checked.
  const baseHints = useDeckHints(deckId, statsCards, data?.leader_card_id ?? null, !editing);
  // "Why? Ask Log Pose" on a hint, only while Log Pose can answer here.
  const askLogPose = useLogPoseAsk();
  const hints = useMemo(
    () => (askLogPose ? { ...baseHints, onAsk: (h: DeckHint) => askLogPose(hintAsk(h)) } : baseHints),
    [baseHints, askLogPose],
  );
  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (onlyNeed) parts.push("Still need");
    if (effectiveSorts.length) parts.push(effectiveSorts.map((k) => SORT_LABELS[k]).join(" › "));
    if (showAltArts) parts.push("Alt arts");
    if (layout === "grid") parts.push("Grid");
    return parts.join(" · ");
  }, [onlyNeed, effectiveSorts, showAltArts, layout]);
  const filterCount = (onlyNeed ? 1 : 0) + (effectiveSorts.length ? 1 : 0) + (showAltArts ? 1 : 0);

  if (!data && lastError.current) {
    return <LoadErrorBlock title="Couldn't load this deck" message={lastError.current.message} retrying={isFetching} onRetry={() => void refetch()} />;
  }
  if (isLoading) return <DeckDetailSkeleton />;
  if (!data) return null;

  const duelUrl = duelPlayUrl(data);
  const refresh = () => invalidateOwnedViews(qc);
  const flashRow = (id: string) => setRowFlash((f) => ({ id, n: (f?.n ?? 0) + 1 }));
  const visibleCount = main.length + additional.length + donCards.length;
  const mainCount = data.main_cards ?? progressCards.reduce((s, c) => s + c.needed, 0);
  const donCount = data.don_cards ?? data.cards
    .filter((c) => c.section === "don" || isDonCardType(c.card_type))
    .reduce((s, c) => s + c.needed, 0);
  const leaderArt = data.leader_card_id
    ? data.cards.find((c) => c.card_id === data.leader_card_id)?.image_url
    : undefined;

  return (
    <div className={`deck-layout${sideEdit ? " deck-layout-editing" : ""}`}>
    <section className="deck-main">
      <div className="page-head">
        <div className="deck-detail-head">
          {data.leader_card_id && (
            <CardArtImg
              className="deck-detail-leader"
              src={leaderArt}
              cardId={data.leader_card_id}
              alt={data.leader_name || data.leader_card_id || "Leader"}
            />
          )}
          <div className="deck-detail-head-text">
          <p className="eyebrow">
            <Link to="/decks">← Decks</Link>
          </p>
          <div className={`deck-detail-title-row${renaming ? " is-renaming" : ""}`}>
            {renaming && (
              <form
                className="deck-rename-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  submitRename();
                }}
              >
                <input
                  className="deck-rename-input"
                  aria-label="Deck name"
                  value={renameText}
                  maxLength={200}
                  autoFocus
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => setRenameText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      cancelRename();
                    }
                  }}
                />
                <button
                  type="submit"
                  className="btn primary deck-rename-btn"
                  disabled={rename.isPending || !renameText.trim()}
                >
                  Save
                </button>
                <button type="button" className="btn secondary deck-rename-btn" onClick={cancelRename}>
                  Cancel
                </button>
              </form>
            )}
            <h1>{data.name}</h1>
            <button
              type="button"
              className="deck-rename-trigger"
              aria-label="Rename deck"
              title="Rename deck"
              onClick={() => {
                rename.reset();
                setRenameText(data.name);
                setRenaming(true);
              }}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                <path
                  d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3zM14.5 7.5l3 3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {data.is_main && <span className="deck-main-badge">Main deck</span>}
            <span className="muted deck-size-inline">
              Main {mainCount}/{MAIN_DECK_LIMIT} · DON!! {donCount}/{DON_DECK_LIMIT}
            </span>
          </div>
          {rename.isError && <p className="error deck-rename-error">{(rename.error as Error).message}</p>}
          <p className="muted">
            {data.leader_card_id
              ? `Leader ${data.leader_card_id}${data.leader_name ? ` · ${data.leader_name}` : ""}`
              : "No leader detected"}
            {data.prior_decks.length > 0
              ? ` · Compared to Main: ${data.prior_decks.join(", ")}`
              : data.is_main && data.leader_card_id
                ? " · Main deck for this leader"
                : ""}
          </p>
          <p className="muted deck-size-meta deck-size-below">
            Main {mainCount}/{MAIN_DECK_LIMIT} · DON!! {donCount}/{DON_DECK_LIMIT}
          </p>
          </div>
        </div>
        <div className="page-head-actions deck-head-actions">
          <button
            type="button"
            className={`deck-edit-toggle ${editing ? "btn secondary" : "btn primary"}`}
            aria-pressed={editing}
            onClick={() => {
              setEditing((v) => {
                const next = !v;
                if (!next && searchParams.get("edit") === "1") {
                  const nextParams = new URLSearchParams(searchParams);
                  nextParams.delete("edit");
                  setSearchParams(nextParams, { replace: true });
                }
                return next;
              });
            }}
          >
            {editing ? (
              <>
                Done<span className="done-editing-extra"> editing</span>
              </>
            ) : (
              "Edit deck"
            )}
          </button>
          {duelUrl ? (
            <a className="btn secondary duel-play-btn" href={duelUrl} target="_blank" rel="noopener">
              Play in Duel
            </a>
          ) : (
            <span className="btn secondary duel-play-btn" aria-disabled="true" title="Needs a leader and cards">
              Play in Duel
            </span>
          )}
          <HeadPopover
            label="Share"
            icon={<ShareIcon />}
            className="btn quiet"
            panelLabel="Share and export"
            width={360}
          >
            <div className="head-popover-sections">
              <DeckSharePanel
                shareMsg={shareMsg}
                sharing={shareDeck.isPending}
                onShare={() => shareDeck.mutate()}
              />
              <DeckExportPanel
                deck={data}
                exportMsg={exportMsg}
                onCopy={() => void copyOptcgSimList()}
                onDownload={downloadOptcgSimList}
              />
            </div>
          </HeadPopover>
          <HeadMenu label="More" icon={<MoreIcon />} className="btn quiet" width={260}>
            <HideFromFriendsItem deck={data} onUpdated={applyDeckUpdate} />
            {data.leader_card_id && !data.is_main && (
              <MenuItem disabled={setMain.isPending}>
                <button type="button" onClick={() => setMain.mutate()}>
                  {setMain.isPending ? "Setting…" : "Set as Main deck"}
                  <span className="muted">Other decks for this leader compare against it</span>
                </button>
              </MenuItem>
            )}
            <MenuItem>
              <button
                type="button"
                onClick={() => {
                  setResetMsg(null);
                  setReplaceOpen(true);
                }}
              >
                Replace with deck list…
                <span className="muted">Paste a deck code to overwrite this deck</span>
              </button>
            </MenuItem>
            <MenuItem disabled={resetOwned.isPending || data.cards.length === 0}>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  const ok = window.confirm(
                    "Reset owned counts to 0 for every card in this deck?\n\n" +
                      "Owned is shared across decks — those cards will also show as unowned in Shopping and other decks, and leave your Collection.",
                  );
                  if (!ok) return;
                  setResetMsg(null);
                  resetOwned.mutate();
                }}
              >
                {resetOwned.isPending ? "Resetting…" : "Reset owned counts"}
                <span className="muted">Sets every card in this deck to 0 owned (also removes them from Collection)</span>
              </button>
            </MenuItem>
          </HeadMenu>
        </div>
      </div>

      {setMain.isError && (
        <p className="error">{(setMain.error as Error).message}</p>
      )}

      {resetMsg && (
        <p className="share-banner" role="status">
          {resetMsg}
        </p>
      )}

      <ReplaceDeckListDialog
        open={replaceOpen}
        deckId={deckId}
        deckName={data.name}
        onClose={() => setReplaceOpen(false)}
        onReplaced={(detail) => {
          applyDeckUpdate(detail);
          setReplaceOpen(false);
          const count = detail.cards.reduce((n, c) => n + c.needed, 0);
          setResetMsg(`Replaced with the pasted list (${count} card${count === 1 ? "" : "s"}).`);
        }}
      />

      {editing && !sideEdit && (
        <DeckEditorPanel deckId={deckId} deck={data} onUpdated={applyDeckUpdate} onChanged={flashRow} onReplaceList={() => setReplaceOpen(true)} />
      )}

      <DeckProgressSummary cards={progressCards} />

      <div className="list-toolbar deck-toolbar">
        <div className="list-toolbar-row">
          <CardSearchInput value={search} onChange={setSearch} />
          <CardLayoutToggle layout={layout} onChange={setLayout} />
        </div>
        <CollapsibleFilters summary={filterSummary} badge={filterCount} badgeLabel="active filters">
          <div className="filters">
            <label>
              <input type="checkbox" checked={onlyNeed} onChange={(e) => setOnlyNeed(e.target.checked)} />
              Still need only
            </label>
            <SortMenu
              sorts={sorts}
              onChange={setSorts}
              onlyNeed={onlyNeed}
              unavailableKeys={deckUnavailableSorts}
              columnSortKey={COLSORT_DECK_KEY}
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
        </CollapsibleFilters>
      </div>

      {search.trim() && (
        <p className="search-result-note muted">
          Showing {visibleCount} match{visibleCount === 1 ? "" : "es"} for “{search.trim()}”
        </p>
      )}

      {neededErr && <p className="error">{neededErr}</p>}
      {altOwnedErr && <p className="error">{altOwnedErr}</p>}

      {data.prior_decks.length > 0 && (
        <p className="banner">
          Cards also in the Main deck ({data.prior_decks.join(", ")}) are listed first. Cards that
          differ appear under Additional Cards.
        </p>
      )}
      <h2>Deck list</h2>
      <CardTable
        cards={main}
        onOwnedSaved={refresh}
        showAltArts={showAltArts}
        layout={layout}
        editing={editing}
        onNeededChange={(cardId, needed) => void changeNeeded(cardId, needed)}
        neededBusyId={neededBusyId}
        onAltOwnedChange={(cardId, productId, qty) => void changeAltOwned(cardId, productId, qty)}
        onDisplayArtChange={(cardId, productId) => void changeDisplayArt(cardId, productId)}
        altOwnedBusyKey={altOwnedBusyKey}
        onAltBuyChange={(cardId, productId, qty) => void changeAltBuy(cardId, productId, qty)}
        onCollectorChange={(cardId, productId, qty) => void changeCollector(cardId, productId, qty)}
        collectorBusyKey={collectorBusyKey}
      />
      {additional.length > 0 && (
        <>
          <h2 className="additional-heading">
            Additional Cards — not in {data.prior_decks.join(", ")}
          </h2>
          <CardTable
            cards={additional}
            onOwnedSaved={refresh}
            showAltArts={showAltArts}
            layout={layout}
            editing={editing}
            onNeededChange={(cardId, needed) => void changeNeeded(cardId, needed)}
            neededBusyId={neededBusyId}
            onAltOwnedChange={(cardId, productId, qty) => void changeAltOwned(cardId, productId, qty)}
            onDisplayArtChange={(cardId, productId) => void changeDisplayArt(cardId, productId)}
            altOwnedBusyKey={altOwnedBusyKey}
            onAltBuyChange={(cardId, productId, qty) => void changeAltBuy(cardId, productId, qty)}
            onCollectorChange={(cardId, productId, qty) => void changeCollector(cardId, productId, qty)}
            collectorBusyKey={collectorBusyKey}
          />
        </>
      )}

      <AvailableDonSection deckId={deckId} deck={data} onUpdated={applyDeckUpdate} />

      <h2 className="don-heading">
        DON!! deck · {donCount}/{DON_DECK_LIMIT}
      </h2>
      {donCards.length === 0 ? (
        <p className="muted">
          {hasDonInDeck
            ? "No DON!! cards match the current filters."
            : "No DON!! cards in this deck yet. Add some from the list above."}
        </p>
      ) : (
        <CardTable
          cards={donCards}
          onOwnedSaved={refresh}
          showAltArts={showAltArts}
          layout={layout}
          editing={editing}
          onNeededChange={(cardId, needed) => void changeNeeded(cardId, needed)}
          neededBusyId={neededBusyId}
          onAltOwnedChange={(cardId, productId, qty) => void changeAltOwned(cardId, productId, qty)}
          onDisplayArtChange={(cardId, productId) => void changeDisplayArt(cardId, productId)}
          altOwnedBusyKey={altOwnedBusyKey}
          onAltBuyChange={(cardId, productId, qty) => void changeAltBuy(cardId, productId, qty)}
          onCollectorChange={(cardId, productId, qty) => void changeCollector(cardId, productId, qty)}
          collectorBusyKey={collectorBusyKey}
        />
      )}
    </section>
    {sideEdit && (
      <aside className="deck-editor-side" aria-label="Add cards">
        <DeckEditorPanel deckId={deckId} deck={data} onUpdated={applyDeckUpdate} onChanged={flashRow} onReplaceList={() => setReplaceOpen(true)} />
      </aside>
    )}
    <DeckStatsDock cards={statsCards} leaderId={data.leader_card_id ?? null} hints={hints} compact={sideEdit} />
    </div>
  );
}
