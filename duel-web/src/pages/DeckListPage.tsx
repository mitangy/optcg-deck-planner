import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { lookupCard } from "../cards/atlas";
import { resolveCardImageUrl } from "../decks/artPrefs";
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
  const art = deck.leader_image_url || null;
  const [failedArt, setFailedArt] = useState<string | null>(null);
  const showArt = Boolean(art) && art !== failedArt;
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
            onError={() => setFailedArt(art)}
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

function DeckRow({
  deck,
  onOpen,
  onDelete,
  arrived,
}: {
  deck: SavedDeck;
  arrived: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const leader = lookupCard(deck.leaderId);
  const leaderArt = resolveCardImageUrl(deck.leaderId, { deck, size: "thumb" });
  const [failedArtSrc, setFailedArtSrc] = useState<string | null>(null);
  const canDelete = !deck.id.startsWith("test-");
  const showArt = Boolean(leaderArt) && leaderArt !== failedArtSrc;

  return (
    <SwipeRow
      className="deck-list-row"
      arrived={arrived}
    >
      <button type="button" className="deck-list-open" onClick={onOpen}>
        {showArt ? (
          <img
            className="deck-list-leader"
            src={leaderArt!}
            alt=""
            loading="lazy"
            onError={() => setFailedArtSrc(leaderArt ?? null)}
          />
        ) : (
          <span className="deck-list-leader deck-list-leader-fallback" aria-hidden>
            {deck.leaderId}
          </span>
        )}
        <div className="deck-list-meta">
          <div className="deck-list-name">{deck.name}</div>
          <div className="deck-list-sub">
            {leader.name} ({deck.leaderId}) · {deck.cards.length} main
          </div>
        </div>
      </button>
      {canDelete ? (
        <button type="button" className="btn btn-danger deck-list-delete" onClick={onDelete}>
          Delete
        </button>
      ) : (
        <span className="deck-list-builtin" title="Built-in test deck">
          Built-in
        </span>
      )}
    </SwipeRow>
  );
}

export function DeckListPage() {
  const navigate = useNavigate();
  const [tick, setTick] = useState(0);
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
  }, [tick]);

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
          <Link to="/" className="btn btn-secondary deck-config-back">
            ← Home
          </Link>
          <div className="deck-config-heading">
            <h1 className="deck-config-title">Decks</h1>
            <p className="meta">Choose a deck to edit, or create a new one.</p>
          </div>
          <button
            type="button"
            className="btn btn-primary deck-list-new"
            onClick={() => navigate("/decks/new")}
          >
            New deck
          </button>
        </header>

        <div className="deck-list-columns">
          <section
            className={`deck-drop-zone${dropClass}`}
            data-deck-drop="local"
            aria-label="Your decks"
          >
            <h2 className="lobby-section-title">Your decks</h2>
            {decks.length === 0 ? (
              <p className="meta">
                No decks yet.{" "}
                <button type="button" className="linkish" onClick={() => navigate("/decks/new")}>
                  Create a deck
                </button>
                .
              </p>
            ) : (
              <ul className="deck-list">
                {decks.map((deck) => (
                  <DeckRow
                    key={deck.id}
                    deck={deck}
                    onOpen={() => {
                      setSelectedDeckId(deck.id);
                      navigate(`/decks/${deck.id}/configure`);
                    }}
                    onDelete={() => {
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
                    }}
                    arrived={arrived.has(deck.id)}
                  />
                ))}
              </ul>
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
