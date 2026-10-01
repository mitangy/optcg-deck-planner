import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { DeckEditor } from "../board/DeckEditor";
import { DeckImportPanel } from "../board/DeckImportPanel";
import { MAX_MAIN_DECK_SIZE } from "../decks/editDeck";
import { pullPlannerDeck, saveDeckToPlanner } from "../decks/planner";
import { fetchAuthMe } from "../net/api";
import {
  getSavedDeck,
  importIntoSavedDeck,
  setSelectedDeckId,
} from "../decks/storage";

export function DeckConfigurePage() {
  const { deckId } = useParams<{ deckId: string }>();
  const [tick, setTick] = useState(0);
  const [importText, setImportText] = useState("");
  const [importErr, setImportErr] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const location = useLocation();
  const [notice, setNotice] = useState<string | null>(
    () => (location.state as { importNotice?: string } | null)?.importNotice ?? null,
  );
  /** `null` until /auth/me answers; the actions row is reserved meanwhile so nothing shifts. */
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [plannerBusy, setPlannerBusy] = useState(false);
  const [plannerErr, setPlannerErr] = useState<string | null>(null);

  const deck = useMemo(() => {
    void tick;
    return deckId ? getSavedDeck(deckId) : undefined;
  }, [deckId, tick]);

  useEffect(() => {
    if (deck) setSelectedDeckId(deck.id);
  }, [deck]);

  useEffect(() => {
    let cancelled = false;
    fetchAuthMe()
      .then((u) => {
        if (!cancelled) setSignedIn(Boolean(u));
      })
      .catch(() => {
        if (!cancelled) setSignedIn(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!deckId || !deck) {
    return <Navigate to="/decks" replace />;
  }

  function refresh() {
    setTick((n) => n + 1);
  }

  async function runPlannerAction(fn: () => Promise<string | null>) {
    setPlannerErr(null);
    setNotice(null);
    setPlannerBusy(true);
    try {
      const msg = await fn();
      refresh();
      if (msg) setNotice(msg);
    } catch (e) {
      setPlannerErr(e instanceof Error ? e.message : "Planner request failed");
    } finally {
      setPlannerBusy(false);
    }
  }

  function onSaveToPlanner() {
    void runPlannerAction(async () => {
      await saveDeckToPlanner(deck!);
      return "Saved to your planner.";
    });
  }

  function onRefreshFromPlanner() {
    void runPlannerAction(async () => {
      const result = await pullPlannerDeck(deck!.plannerDeckId!);
      if (!result.ok) throw new Error(result.errors.join(" · ") || "Planner deck is not valid for duel");
      return `Refreshed from planner (${result.deck.cards.length} main)${
        result.warnings.length ? ` — ${result.warnings.join(" ")}` : ""
      }`;
    });
  }

  function onImportIntoDeck() {
    setImportErr(null);
    setImportMsg(null);
    setImportBusy(true);
    const result = importIntoSavedDeck(deckId!, importText);
    setImportBusy(false);
    if (!result.ok) {
      setImportErr(result.errors.join(" · ") || "Import failed");
      return;
    }
    setImportText("");
    refresh();
    setImportMsg(
      `Imported (${result.deck.cards.length} main)${
        result.warnings.length ? ` — ${result.warnings.join(" ")}` : ""
      }`,
    );
  }

  return (
    <div className="app-shell">
      <div className="deck-config deck-config-wide">
        <header className="deck-config-header">
          <Link to="/decks" className="btn btn-secondary deck-config-back">
            ← Decks
          </Link>
          <div className="deck-config-heading">
            <h1 className="deck-config-title">{deck.name}</h1>
            <p className="meta">
              Leader {deck.leaderId} · {deck.cards.length}/{MAX_MAIN_DECK_SIZE} main
            </p>
          </div>
        </header>

        {signedIn !== false || deck.plannerDeckId ? (
          <div className="deck-planner-actions">
            {deck.plannerDeckId ? (
              <>
                <span className="deck-planner-badge">From planner</span>
                {signedIn ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={onRefreshFromPlanner}
                    disabled={plannerBusy}
                  >
                    {plannerBusy ? "Refreshing…" : "Refresh from planner"}
                  </button>
                ) : null}
              </>
            ) : signedIn ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onSaveToPlanner}
                disabled={plannerBusy}
              >
                {plannerBusy ? "Saving…" : "Save to planner"}
              </button>
            ) : null}
          </div>
        ) : null}
        {plannerErr ? <p className="error-text deck-config-notice">{plannerErr}</p> : null}
        {notice ? <p className="meta deck-config-notice">{notice}</p> : null}

        <DeckEditor
          deckId={deck.id}
          refreshKey={tick}
          onDeckChanged={refresh}
          sideTop={
            <DeckImportPanel
              collapsible
              importText={importText}
              onImportTextChange={setImportText}
              onImport={onImportIntoDeck}
              busy={importBusy}
              error={importErr}
              message={importMsg}
            />
          }
        />
      </div>
    </div>
  );
}
