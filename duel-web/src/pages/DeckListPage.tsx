import { useEffect, useMemo, useRef, useState } from "react";
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
  listPlannerDecks,
  parsePlannerDeepLink,
  pullPlannerDeck,
  type PlannerDeckSummary,
} from "../decks/planner";
import { fetchAuthMe, googleLoginUrl, type AuthUser } from "../net/api";
import type { ImportIntoDeckResult } from "../decks/storage";

type PlannerState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "error"; message: string }
  | { status: "ready"; decks: PlannerDeckSummary[] };

function PlannerRow({
  deck,
  busy,
  onOpen,
}: {
  deck: PlannerDeckSummary;
  busy: boolean;
  onOpen: () => void;
}) {
  const art = deck.leader_image_url || null;
  const [failedArt, setFailedArt] = useState<string | null>(null);
  const showArt = Boolean(art) && art !== failedArt;
  const count = deck.main_cards || deck.card_count;
  return (
    <li className="deck-list-row">
      <button type="button" className="deck-list-open" onClick={onOpen} disabled={busy}>
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
      </button>
    </li>
  );
}

function DeckRow({
  deck,
  onOpen,
  onDelete,
}: {
  deck: SavedDeck;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const leader = lookupCard(deck.leaderId);
  const leaderArt = resolveCardImageUrl(deck.leaderId, { deck, size: "thumb" });
  const [failedArtSrc, setFailedArtSrc] = useState<string | null>(null);
  const canDelete = !deck.id.startsWith("test-");
  const showArt = Boolean(leaderArt) && leaderArt !== failedArtSrc;

  return (
    <li className="deck-list-row">
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
      ) : null}
    </li>
  );
}

export function DeckListPage() {
  const navigate = useNavigate();
  const [tick, setTick] = useState(0);
  const [planner, setPlanner] = useState<PlannerState>({ status: "loading" });
  const [importing, setImporting] = useState(false);
  const [importErr, setImportErr] = useState<string | null>(null);
  const deepLinkHandled = useRef(false);

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

  async function openPlannerDeck(id: number) {
    setImportErr(null);
    setImporting(true);
    try {
      openImported(await pullPlannerDeck(id));
    } catch (e) {
      setImportErr(e instanceof Error ? e.message : "Could not load the planner deck");
    } finally {
      setImporting(false);
    }
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
  }, []);

  const decks = useMemo(() => {
    void tick;
    ensureDefaultDeck();
    ensureTestDecks();
    return listSavedDecks();
  }, [tick]);

  function refresh() {
    setTick((n) => n + 1);
  }

  return (
    <div className="app-shell">
      <div className="deck-config">
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
                      `Delete “${deck.name}”? This cannot be undone.`,
                    )
                  ) {
                    return;
                  }
                  deleteDeck(deck.id);
                  refresh();
                }}
              />
            ))}
          </ul>
        )}

        <section className="deck-planner-section" aria-label="From your planner">
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
            <p className="error-text deck-planner-status">{planner.message}</p>
          ) : planner.decks.length === 0 ? (
            <p className="meta deck-planner-status">No planner decks yet.</p>
          ) : (
            <ul className="deck-list">
              {planner.decks.map((d) => (
                <PlannerRow
                  key={d.id}
                  deck={d}
                  busy={importing}
                  onOpen={() => void openPlannerDeck(d.id)}
                />
              ))}
            </ul>
          )}
          <p className="error-text deck-planner-error" role="alert" aria-live="polite">
            {importErr}
          </p>
        </section>
      </div>
    </div>
  );
}
