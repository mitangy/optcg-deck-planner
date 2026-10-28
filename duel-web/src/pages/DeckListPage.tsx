import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { BackLink } from "./BackLink";
import { isIncompleteDeck } from "../decks/deckStatus";
import { lookupCard } from "../cards/atlas";
import { resolveCardImageUrl } from "../decks/artPrefs";
import { useArtFallback } from "../cards/useArtFallback";
import {
  deleteDeck,
  ensureDefaultDeck,
  ensureTestDecks,
  listSavedDecks,
  setSelectedDeckId,
  type SavedDeck,
} from "../decks/storage";
import {
  applyPlannerDeepLink,
  importPlannerDecks,
  plannerDeckImported,
  listPlannerDecks,
  parsePlannerDeepLink,
  plannerDecksNotLocal,
  type PlannerDeckSummary,
} from "../decks/planner";
import { useDeckDrag, type DeckDragItem } from "../decks/useDeckDrag";
import { useSwipeMove } from "../decks/useSwipeMove";
import { DESKTOP_DECKS_QUERY, useMediaQuery } from "../board/useMediaQuery";
import { fetchAuthMe, googleLoginUrl, type AuthUser } from "../net/api";
import type { ImportIntoDeckResult } from "../decks/storage";
import { useSavedDecksVersion } from "../decks/useSavedDecksVersion";
import { NavMenu } from "../nav/NavMenu";
import { Listbox, ListboxButton, ListboxList, ListboxOption, Menu, MenuButton, MenuItem, MenuList } from "@optcg/ui/popups";
import { colorFill } from "../board/PreviewBadges";
import { MAX_MAIN_DECK_SIZE } from "../decks/editDeck";
import {
  DECK_SORTS,
  filterDecks,
  loadDeckSort,
  saveDeckSort,
  sortDecks,
  type DeckSort,
} from "../decks/deckListView";

type PlannerState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "error"; message: string }
  | { status: "ready"; decks: PlannerDeckSummary[] };

function DragHandle({
  label,
  onPointerDown,
}: {
  label: string;
  onPointerDown: (e: ReactPointerEvent) => void;
}) {
  return (
    <span
      className="deck-drag-handle"
      role="img"
      aria-label={label}
      title={label}
      onPointerDown={onPointerDown}
    >
      <svg viewBox="0 0 10 16" width="10" height="16" aria-hidden>
        {[3, 8, 13].map((y) => (
          <g key={y}>
            <circle cx="2.5" cy={y} r="1.4" />
            <circle cx="7.5" cy={y} r="1.4" />
          </g>
        ))}
      </svg>
    </span>
  );
}

function SwipeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/**
 * One row of either list. On phones (below DESKTOP_DECKS_QUERY) a planner row
 * slides sideways under the finger over a coloured action that fills in as the
 * swipe nears the distance that adds it; desktop keeps the grip drag.
 */
function SwipeRow({
  className,
  swipe,
  arrived,
  children,
}: {
  className: string;
  /** Set when a sideways swipe adds this planner deck to Your decks. */
  swipe?: { label: string; onMove: () => unknown };
  /** The deck just landed in this list: flash it once. */
  arrived?: boolean;
  children: ReactNode;
}) {
  const { dx, phase, progress, armed, handlers } = useSwipeMove(Boolean(swipe), () => swipe?.onMove());
  const side = dx > 0 ? "from-left" : "from-right";
  return (
    <li
      className={`deck-swipe-slot${swipe ? " is-swipeable" : ""}${
        phase === "collapsing" ? " is-collapsing" : ""
      }${arrived ? " is-arrived" : ""}`}
    >
      {swipe && dx !== 0 ? (
        <span
          className={`deck-swipe-action ${side}${armed ? " is-armed" : ""}`}
          style={{ ["--swipe-p" as string]: progress.toFixed(3) }}
          aria-hidden
        >
          <span className="deck-swipe-action-inner">
            <SwipeIcon />
            <span className="deck-swipe-action-label">{swipe.label}</span>
          </span>
        </span>
      ) : null}
      <div
        className={`${className} swipe-${phase}`}
        style={dx !== 0 ? { transform: `translate3d(${dx}px, 0, 0)` } : undefined}
        {...handlers}
      >
        {children}
      </div>
    </li>
  );
}

function PlannerRow({
  deck,
  busy,
  selected,
  dragging,
  arrived,
  onToggle,
  onDragStart,
  onSwipe,
}: {
  deck: PlannerDeckSummary;
  arrived: boolean;
  busy: boolean;
  selected: boolean;
  dragging: boolean;
  onToggle: () => void;
  /** Desktop: grip drag. */
  onDragStart?: (e: ReactPointerEvent) => void;
  /** Phones: swipe sideways to add; resolves false when nothing was added. */
  onSwipe?: () => Promise<boolean | undefined>;
}) {
  const { src: art, fail: failArt } = useArtFallback(deck.leader_image_url || null, deck.leader_card_id);
  const showArt = Boolean(art);
  const count = deck.main_cards || deck.card_count;
  return (
    <SwipeRow
      className={`deck-list-row deck-planner-row${selected ? " is-selected" : ""}${
        dragging ? " is-dragging" : ""
      }`}
      arrived={arrived}
      swipe={onSwipe && !busy ? { label: "Add", onMove: onSwipe } : undefined}
    >
      {onDragStart ? (
        <DragHandle label={`Drag ${deck.name} to your decks`} onPointerDown={onDragStart} />
      ) : null}
      <label className="deck-list-open deck-planner-pick">
        <input
          type="checkbox"
          className="deck-planner-check"
          checked={selected}
          onChange={onToggle}
          disabled={busy}
        />
        {showArt ? (
          <img
            className="deck-list-leader"
            src={art!}
            alt=""
            loading="lazy"
            onError={failArt}
          />
        ) : (
          <span className="deck-list-leader deck-list-leader-fallback" aria-hidden>
            {deck.leader_card_id ?? "—"}
          </span>
        )}
        <div className="deck-list-meta">
          <div className="deck-list-name">{deck.name}</div>
          <div className="deck-list-sub">
            {deck.leader_name || deck.leader_card_id || "No leader"} · {count} cards
          </div>
        </div>
      </label>
    </SwipeRow>
  );
}

const MENU_ANCHOR = { to: "bottom end", gap: 6, padding: 8 } as const;
const SORT_ANCHOR = { to: "bottom end", gap: 6, padding: 8 } as const;

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <circle cx="5" cy="12" r="1.9" />
      <circle cx="12" cy="12" r="1.9" />
      <circle cx="19" cy="12" r="1.9" />
    </svg>
  );
}

function WarnIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden>
      <path d="M12 3.5 22 20.5H2L12 3.5Z" />
      <path d="M12 10v4.5M12 17.4v.2" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m15 15 5 5" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/** One saved deck: leader art with its colours, name, leader, main-deck count and a "…" menu of what you can do with it. */
function DeckCard({
  deck,
  onOpen,
  onPlay,
  onDelete,
  arrived,
}: {
  deck: SavedDeck;
  arrived: boolean;
  onOpen: () => void;
  onPlay: () => void;
  onDelete: () => void;
}) {
  const leader = lookupCard(deck.leaderId);
  const { src: leaderArt, fail: failLeaderArt } = useArtFallback(
    resolveCardImageUrl(deck.leaderId, { deck, size: "thumb" }),
    deck.leaderId,
  );
  const canDelete = !deck.id.startsWith("test-");
  const incomplete = isIncompleteDeck(deck);
  const count = deck.cards.length;
  const colorNames = leader.colors.map((c) => c.charAt(0).toUpperCase() + c.slice(1));

  return (
    <SwipeRow className="deck-list-row deck-card" arrived={arrived}>
      <button type="button" className="deck-card-open" aria-label={`Edit ${deck.name}`} onClick={onOpen}>
        <span className="deck-card-art">
          {leaderArt ? (
            <img className="deck-card-img" src={leaderArt} alt="" loading="lazy" onError={failLeaderArt} />
          ) : (
            <span className="deck-card-img-fallback" aria-hidden>
              {deck.leaderId}
            </span>
          )}
          {colorNames.length ? (
            <span className="deck-card-colors" role="img" aria-label={`Colour ${colorNames.join("/")}`}>
              {colorNames.map((c) => (
                <i key={c} className="deck-card-dot" style={{ background: colorFill([c]) }} title={c} />
              ))}
            </span>
          ) : null}
        </span>
        <span className="deck-card-body">
          <span className="deck-card-name" title={deck.name}>{deck.name}</span>
          <span className="deck-card-leader" title={`${leader.name} (${deck.leaderId})`}>
            {leader.name} · {deck.leaderId}
          </span>
          {incomplete ? (
            <span className="deck-card-warn" role="note">
              <WarnIcon />
              <span>Incomplete: {count} of {MAX_MAIN_DECK_SIZE} main-deck cards</span>
            </span>
          ) : null}
          <span className="deck-card-count">
            <span className="deck-card-count-label">Main deck</span>
            <span className="deck-card-count-num">
              {count}
              <span className="deck-card-count-max">/{MAX_MAIN_DECK_SIZE}</span>
            </span>
            <span
              className={`deck-card-bar${incomplete ? " is-incomplete" : ""}`}
              role="progressbar"
              aria-label={`${count} of ${MAX_MAIN_DECK_SIZE} main-deck cards`}
              aria-valuemin={0}
              aria-valuemax={MAX_MAIN_DECK_SIZE}
              aria-valuenow={Math.min(count, MAX_MAIN_DECK_SIZE)}
            >
              <span style={{ width: `${Math.min(100, (count / MAX_MAIN_DECK_SIZE) * 100)}%` }} />
            </span>
          </span>
        </span>
      </button>
      <div className="deck-card-foot">
        {canDelete ? (
          <span className="deck-card-updated">
            Updated {new Date(deck.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
        ) : (
          <span className="deck-list-builtin" title="Built-in test deck">
            Built-in
          </span>
        )}
        <button type="button" className="deck-card-play" aria-label={`Play with ${deck.name}`} onClick={onPlay}>
          Play <span aria-hidden>→</span>
        </button>
      </div>
      <Menu>
        <MenuButton type="button" className="deck-card-menu-btn" aria-label={`Actions for ${deck.name}`}>
          <MoreIcon />
        </MenuButton>
        <MenuList anchor={MENU_ANCHOR} className="deck-card-menu">
          <MenuItem>
            <button type="button" className="deck-card-menu-item" onClick={onOpen}>
              Edit
            </button>
          </MenuItem>
          <MenuItem>
            <button type="button" className="deck-card-menu-item" onClick={onPlay}>
              Play with this deck
            </button>
          </MenuItem>
          {canDelete ? (
            <MenuItem>
              <button type="button" className="deck-card-menu-item is-danger" onClick={onDelete}>
                Delete
              </button>
            </MenuItem>
          ) : null}
        </MenuList>
      </Menu>
    </SwipeRow>
  );
}

/** Search box and sort menu above the deck cards. */
function DeckToolbar({
  query,
  onQuery,
  sort,
  onSort,
}: {
  query: string;
  onQuery: (q: string) => void;
  sort: DeckSort;
  onSort: (s: DeckSort) => void;
}) {
  const label = DECK_SORTS.find((s) => s.id === sort)?.label ?? "";
  return (
    <div className="deck-toolbar">
      <label className="deck-list-search">
        <SearchIcon />
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search decks or leaders"
          aria-label="Search decks or leaders"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <Listbox value={sort} onChange={onSort}>
        <ListboxButton className="deck-sort-btn" aria-label={`Sort decks: ${label}`}>
          <span className="deck-sort-prefix">Sort:</span>
          <span className="deck-sort-value">{label}</span>
          <ChevronIcon />
        </ListboxButton>
        <ListboxList anchor={SORT_ANCHOR} className="deck-card-menu deck-sort-menu">
          {DECK_SORTS.map((s) => (
            <ListboxOption key={s.id} value={s.id} className="deck-card-menu-item deck-sort-option">
              <span className="deck-sort-check" aria-hidden>
                {s.id === sort ? "✓" : ""}
              </span>
              {s.label}
            </ListboxOption>
          ))}
        </ListboxList>
      </Listbox>
    </div>
  );
}

export function DeckListPage() {
  const navigate = useNavigate();
  const [tick, setTick] = useState(0);
  const syncedDecks = useSavedDecksVersion();
  const [planner, setPlanner] = useState<PlannerState>({ status: "loading" });
  const [plannerTry, setPlannerTry] = useState(0);
  const [importing, setImporting] = useState(false);
  const [importErr, setImportErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Phones: what the last swipe did, with a way to undo it. */
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  /** Decks that just changed lists, flashed once where they landed. */
  const [arrived, setArrived] = useState<Set<number | string>>(() => new Set());
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const deepLinkHandled = useRef(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<DeckSort>(loadDeckSort);
  // Phones swipe rows between the lists; the grip drag could not reach the top of a long list.
  const phone = !useMediaQuery(DESKTOP_DECKS_QUERY);

  function openImported(result: ImportIntoDeckResult) {
    if (!result.ok) {
      setImportErr(result.errors.join(" · ") || "Import failed");
      return;
    }
    setSelectedDeckId(result.deck.id);
    navigate(`/decks/${result.deck.id}/configure`, {
      replace: true,
      state: result.warnings.length ? { importNotice: result.warnings.join(" ") } : undefined,
    });
  }

  function flashArrived(ids: (number | string)[]) {
    setArrived(new Set(ids));
  }

  /**
   * With `swipedId` (a phone swipe), resolves true only when that deck itself
   * arrived, so its row comes back if it failed while other ticked decks were added.
   */
  async function addPlannerDecks(ids: number[], via: "swipe" | "other" = "other", swipedId?: number) {
    if (planner.status !== "ready" || ids.length === 0) return;
    const picked = planner.decks.filter((d) => ids.includes(d.id));
    setImportErr(null);
    setNotice(null);
    setImporting(true);
    try {
      const { imported, errors } = await importPlannerDecks(picked);
      const done = new Set(imported.map((d) => d.plannerDeckId));
      setSelected((prev) => new Set([...prev].filter((id) => !done.has(id))));
      if (imported.length) {
        const text =
          imported.length === 1
            ? `Added ${imported[0].name} to your decks.`
            : `Added ${imported.length} decks to your decks.`;
        flashArrived(imported.map((d) => d.id));
        if (via === "swipe") {
          const ids = imported.map((d) => d.id);
          setToast({
            text: imported.length === 1 ? `Added ${imported[0].name}` : `Added ${imported.length} decks`,
            undo: () => {
              ids.forEach((id) => deleteDeck(id));
              flashArrived([...done].filter((id): id is number => id != null));
              setToast(null);
              refresh();
            },
          });
        } else {
          setNotice(text);
        }
      }
      if (errors.length) setImportErr(errors.join(" · "));
      return swipedId != null ? plannerDeckImported(imported, swipedId) : imported.length > 0;
    } finally {
      setImporting(false);
      refresh();
    }
  }

  // The toast steps aside on its own; a new swipe replaces it.
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  // The landing flash plays once (styles.css .is-arrived).
  useEffect(() => {
    if (arrived.size === 0) return;
    const t = window.setTimeout(() => setArrived(new Set()), 1200);
    return () => window.clearTimeout(t);
  }, [arrived]);

  const { drag, startDrag } = useDeckDrag((item) => void addPlannerDecks(item.ids));

  useEffect(() => {
    // The deep link (and its hash fallback) is consumed once; the ref guards StrictMode's
    // double-invoked effect, and the URL is cleared so a refresh cannot re-import.
    const link = deepLinkHandled.current
      ? null
      : parsePlannerDeepLink(window.location.search, window.location.hash);
    if (link) deepLinkHandled.current = true;
    if (link) window.history.replaceState(window.history.state, "", "/decks");
    let cancelled = false;
    void (async () => {
      let me: AuthUser | null = null;
      try {
        me = await fetchAuthMe();
      } catch {
        me = null;
      }
      if (link) {
        setImporting(true);
        try {
          openImported(await applyPlannerDeepLink(link, Boolean(me)));
        } finally {
          setImporting(false);
        }
      }
      if (cancelled) return;
      if (!me) {
        setPlanner({ status: "signed-out" });
        return;
      }
      try {
        const decks = await listPlannerDecks();
        if (!cancelled) setPlanner({ status: "ready", decks });
      } catch (e) {
        if (!cancelled) {
          setPlanner({
            status: "error",
            message: e instanceof Error ? e.message : "Could not load planner decks",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plannerTry]);

  const decks = useMemo(() => {
    void tick;
    ensureDefaultDeck();
    ensureTestDecks();
    return listSavedDecks();
  }, [tick, syncedDecks]);

  const shownDecks = useMemo(() => sortDecks(filterDecks(decks, query), sort), [decks, query, sort]);

  function pickSort(next: DeckSort) {
    setSort(next);
    saveDeckSort(next);
  }

  function playWith(deck: SavedDeck) {
    setSelectedDeckId(deck.id);
    navigate("/");
  }

  function confirmDelete(deck: SavedDeck) {
    if (
      !window.confirm(
        deck.plannerDeckId
          ? `Delete “${deck.name}” from your duel decks? It stays in your planner.`
          : `Delete “${deck.name}”? This cannot be undone.`,
      )
    ) {
      return;
    }
    deleteDeck(deck.id);
    refresh();
  }

  const plannerLeft = useMemo(
    () => (planner.status === "ready" ? plannerDecksNotLocal(planner.decks, decks) : []),
    [planner, decks],
  );
  const selectedLeft = plannerLeft.filter((d) => selected.has(d.id));
  const allSelected = plannerLeft.length > 0 && selectedLeft.length === plannerLeft.length;

  function refresh() {
    setTick((n) => n + 1);
  }

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Dragging or swiping a ticked deck carries every ticked deck with it. */
  function plannerGroup(d: PlannerDeckSummary) {
    return selected.has(d.id) ? selectedLeft : [d];
  }

  function dragPlanner(e: ReactPointerEvent, d: PlannerDeckSummary) {
    if (importing) return;
    const group = plannerGroup(d);
    const item: DeckDragItem = {
      kind: "planner",
      ids: group.map((g) => g.id),
      label: group.length === 1 ? group[0].name : `${group.length} decks`,
    };
    startDrag(e, item);
  }

  const dragIds = new Set<number>(drag ? drag.item.ids : []);
  const dropClass = drag ? (drag.over ? " is-drop-target is-drop-over" : " is-drop-target") : "";

  return (
    <div className={`app-shell${drag ? " is-deck-dragging" : ""}`}>
      <div className="deck-config deck-config-wide deck-list-page">
        <header className="deck-config-header">
          <div className="deck-config-nav">
            <NavMenu />
            <BackLink to="/" label="Home" ariaLabel="Back to home" />
          </div>
          <div className="deck-config-heading">
            <h1 className="deck-config-title">Decks</h1>
            <p className="meta deck-list-subtitle">Choose a deck to edit, or create a new one.</p>
          </div>
          <div className="deck-list-header-actions">
            <button
              type="button"
              className="btn btn-secondary deck-list-meta"
              onClick={() => navigate("/decks/meta")}
            >
              Meta decks
            </button>
            <button
              type="button"
              className="btn btn-primary deck-list-new"
              onClick={() => navigate("/decks/new")}
            >
              <span aria-hidden>+</span> New deck
            </button>
          </div>
        </header>

        <div className="deck-list-columns">
          <section
            className={`deck-drop-zone${dropClass}`}
            data-deck-drop="local"
            aria-label="Your decks"
          >
            <h2 className="lobby-section-title">
              Your decks
              <span className="deck-list-count" aria-label={`${decks.length} decks`}>
                {query.trim() ? `${shownDecks.length} of ${decks.length}` : decks.length}
              </span>
            </h2>
            {decks.length === 0 ? (
              <p className="meta">
                No decks yet.{" "}
                <button type="button" className="linkish" onClick={() => navigate("/decks/new")}>
                  Create a deck
                </button>
                .
              </p>
            ) : (
              <>
                <DeckToolbar query={query} onQuery={setQuery} sort={sort} onSort={pickSort} />
                {shownDecks.length === 0 ? (
                  <p className="meta deck-list-empty" role="status">
                    No decks match “{query.trim()}”.{" "}
                    <button type="button" className="linkish" onClick={() => setQuery("")}>
                      Clear search
                    </button>
                  </p>
                ) : (
                  <ul className="deck-list deck-grid">
                    {shownDecks.map((deck) => (
                      <DeckCard
                        key={deck.id}
                        deck={deck}
                        onOpen={() => {
                          setSelectedDeckId(deck.id);
                          navigate(`/decks/${deck.id}/configure`);
                        }}
                        onPlay={() => playWith(deck)}
                        onDelete={() => confirmDelete(deck)}
                        arrived={arrived.has(deck.id)}
                      />
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>

          <section
            className="deck-planner-section deck-drop-zone"
            aria-label="From your planner"
          >
            <h2 className="lobby-section-title">From your planner</h2>
            {planner.status === "loading" ? (
              <p className="meta deck-planner-status">Loading planner decks…</p>
            ) : planner.status === "signed-out" ? (
              <p className="meta deck-planner-status">
                Planner decks appear after{" "}
                <a className="linkish" href={googleLoginUrl(window.location.origin + "/decks")}>
                  signing in with Google
                </a>
                .
              </p>
            ) : planner.status === "error" ? (
              <p className="error-text deck-planner-status" title={planner.message}>
                Couldn&apos;t load your planner decks.{" "}
                <button
                  type="button"
                  className="linkish"
                  onClick={() => {
                    setPlanner({ status: "loading" });
                    setPlannerTry((n) => n + 1);
                  }}
                >
                  Try again
                </button>
              </p>
            ) : planner.decks.length === 0 ? (
              <p className="meta deck-planner-status">No planner decks yet.</p>
            ) : (
              <>
                <div className="deck-planner-toolbar">
                  <p className="meta deck-planner-hint">
                    {phone
                      ? "Tick decks to add them, or swipe a deck sideways to add it."
                      : "Tick decks to add them, or drag them to Your decks."}
                  </p>
                  <div className="deck-planner-toolbar-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={importing || plannerLeft.length === 0}
                      onClick={() =>
                        setSelected(allSelected ? new Set() : new Set(plannerLeft.map((d) => d.id)))
                      }
                    >
                      {allSelected ? "Clear" : "Select all"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary deck-planner-add"
                      disabled={importing || selectedLeft.length === 0}
                      onClick={() => void addPlannerDecks(selectedLeft.map((d) => d.id))}
                    >
                      {importing ? "Adding…" : `Add selected (${selectedLeft.length})`}
                    </button>
                  </div>
                </div>
                {plannerLeft.length === 0 ? (
                  <p className="meta deck-planner-status">
                    Every planner deck is in Your decks.
                  </p>
                ) : (
                  <ul className="deck-list">
                    {plannerLeft.map((d) => (
                      <PlannerRow
                        key={d.id}
                        deck={d}
                        busy={importing}
                        selected={selected.has(d.id)}
                        dragging={dragIds.has(d.id)}
                        arrived={arrived.has(d.id)}
                        onToggle={() => toggle(d.id)}
                        onDragStart={phone ? undefined : (e) => dragPlanner(e, d)}
                        onSwipe={
                          phone
                            ? () => addPlannerDecks(plannerGroup(d).map((g) => g.id), "swipe", d.id)
                            : undefined
                        }
                      />
                    ))}
                  </ul>
                )}
              </>
            )}
            <p
              className={`${importErr ? "error-text" : "meta"} deck-planner-error`}
              role="alert"
              aria-live="polite"
            >
              {importErr ?? notice}
            </p>
          </section>
        </div>
      </div>
      {phone && toast ? (
        <div className="deck-swipe-toast" role="status" key={toast.text}>
          <span className="deck-swipe-toast-text">{toast.text}</span>
          {toast.undo ? (
            <button type="button" className="deck-swipe-toast-undo" onClick={toast.undo}>
              Undo
            </button>
          ) : null}
        </div>
      ) : null}
      {drag ? (
        <div
          className={`deck-drag-ghost${drag.over ? " is-over" : ""}`}
          style={{ left: drag.x, top: drag.y }}
          aria-hidden
        >
          {drag.item.label}
          <span className="deck-drag-ghost-hint">→ Your decks</span>
        </div>
      ) : null}
    </div>
  );
}
