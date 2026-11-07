import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BackLink } from "../layout/BackLink";
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
import { applyPlannerDeepLink, parsePlannerDeepLink } from "../decks/planner";
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
}: {
  deck: SavedDeck;
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
    <li className="deck-card-slot">
      <div className="deck-list-row deck-card">
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
      </div>
    </li>
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
  /** `null` until /auth/me answers; the status line below the header holds its space meanwhile. */
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [linkErr, setLinkErr] = useState<string | null>(null);
  const deepLinkHandled = useRef(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<DeckSort>(loadDeckSort);

  function openImported(result: ImportIntoDeckResult) {
    if (!result.ok) {
      setLinkErr(result.errors.join(" · ") || "Import failed");
      return;
    }
    setSelectedDeckId(result.deck.id);
    navigate(`/decks/${result.deck.id}/configure`, {
      replace: true,
      state: result.warnings.length ? { importNotice: result.warnings.join(" ") } : undefined,
    });
  }

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
      // The link is consumed by the first effect run, which StrictMode may already have cancelled.
      if (link) openImported(await applyPlannerDeepLink(link, Boolean(me)));
      if (!cancelled) setSignedIn(Boolean(me));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          ? `Delete “${deck.name}”? It is removed from your planner too.`
          : `Delete “${deck.name}”? This cannot be undone.`,
      )
    ) {
      return;
    }
    deleteDeck(deck.id);
    refresh();
  }

  function refresh() {
    setTick((n) => n + 1);
  }

  return (
    <div className="app-shell">
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

        {/* One line whatever the sign-in state, so the decks below never move when it loads. */}
        <p className={`${linkErr ? "error-text" : "meta"} deck-sync-note`} role={linkErr ? "alert" : undefined}>
          {linkErr ??
            (signedIn === null ? null : signedIn ? (
              "Signed in: your decks stay in sync with the deck planner. Planner decks show up here once they have 50 cards."
            ) : (
              <>
                <a className="linkish" href={googleLoginUrl(window.location.origin + "/decks")}>
                  Sign in with Google
                </a>{" "}
                to keep your decks in sync with the deck planner.
              </>
            ))}
        </p>

        <section className="deck-list-section" aria-label="Your decks">
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
                    />
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
