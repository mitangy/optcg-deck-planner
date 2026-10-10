import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { lookupCard } from "../cards/atlas";
import { BackLink } from "./BackLink";
import { useLogPoseDeckEditor, useLogPosePage, type DeckEditor as LogPoseDeckEditor } from "@optcg/analyst-client";
import { DECK_EDITOR_STARTERS, deckContext } from "../logPose";
import { DeckEditor } from "../board/DeckEditor";
import { DeckImportPanel } from "../board/DeckImportPanel";
import { applyOps, isDeckDirty, MAX_MAIN_DECK_SIZE, saveDeckDraft, type DeckDraft } from "../decks/editDeck";
import { useLeaveGuard } from "../decks/useLeaveGuard";
import { pullPlannerDeck, saveDeckToPlanner } from "../decks/planner";
import { fetchAuthMe } from "../net/api";
import {
  getSavedDeck,
  setSelectedDeckId,
  validateImportedList,
  type SavedDeck,
} from "../decks/storage";
import { NavMenu } from "../nav/NavMenu";

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

  const navigate = useNavigate();
  /** Unsaved edits to the open deck; null while the editor shows the saved deck as is (#481). */
  const [edits, setEdits] = useState<(DeckDraft & { deckId: string }) | null>(null);
  const [saveMsg, setSaveMsg] = useState("");
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const saved = useMemo(() => {
    void tick;
    return deckId ? getSavedDeck(deckId) : undefined;
  }, [deckId, tick]);
  const draft: DeckDraft | null = saved ? (edits && edits.deckId === saved.id ? edits : saved) : null;
  /** The saved deck with the draft's leader and cards: what the editor, stats and Log Pose see. */
  const deck: SavedDeck | undefined = saved && draft ? { ...saved, leaderId: draft.leaderId, cards: draft.cards } : undefined;
  const dirty = Boolean(saved && draft && isDeckDirty(saved, draft));
  const leave = useLeaveGuard(dirty);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  /** Write the draft to the deck. Returns false (and says why) when storage refuses. */
  function commit(next: DeckDraft): boolean {
    setSaveErr(null);
    try {
      const result = saveDeckDraft(deckId!, next);
      if (!result.ok) throw new Error(result.error);
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Could not save");
      return false;
    }
    setEdits(null);
    setTick((n) => n + 1);
    setSaveMsg("Saved.");
    return true;
  }

  const savedId = saved?.id;
  useEffect(() => {
    if (savedId) setSelectedDeckId(savedId);
  }, [savedId]);

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

  useLogPosePage(
    deck ? { page: "deck-editor", label: deck.name || "This deck", deck: deckContext(deck), starters: DECK_EDITOR_STARTERS } : null,
  );

  // Log Pose's Apply card changes the draft and saves it at once: Apply is an explicit commit.
  const editor = useMemo<LogPoseDeckEditor | null>(
    () =>
      deck
        ? {
            ref: deckContext(deck).ref!,
            cards: deckContext(deck).cards,
            apply: async (ops) => {
              const result = applyOps(deck.cards, ops);
              if (!result.ok) throw new Error(result.error);
              if (!commit({ leaderId: deck.leaderId, cards: result.cards })) throw new Error("Could not save the deck");
            },
            note: deck.plannerDeckId ? "Saved in the duel app; it stays your game deck until you refresh from the planner." : undefined,
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [saved, edits],
  );
  useLogPoseDeckEditor(editor);

  if (!deckId || !saved || !deck || !draft) {
    return <Navigate to="/decks" replace />;
  }

  function refresh() {
    setTick((n) => n + 1);
  }

  function onChangeDraft(next: DeckDraft) {
    setSaveMsg("");
    setEdits({ ...next, deckId: saved!.id });
  }

  function onDiscard() {
    setSaveMsg("");
    setSaveErr(null);
    setEdits(null);
  }

  function leaveTo(to: string, save: boolean) {
    if (save && !commit(draft!)) {
      leave.clear();
      return;
    }
    leave.clear();
    navigate(to);
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
      await saveDeckToPlanner(saved!);
      return "Saved to your planner.";
    });
  }

  function onRefreshFromPlanner() {
    if ((saved!.editedLocally || dirty) && !window.confirm("Replace your edits with the planner version?")) return;
    void runPlannerAction(async () => {
      const result = await pullPlannerDeck(saved!.plannerDeckId!);
      if (!result.ok) throw new Error(result.errors.join(" · ") || "Planner deck is not valid for duel");
      setEdits(null);
      return `Refreshed from planner (${result.deck.cards.length} main)${
        result.warnings.length ? ` — ${result.warnings.join(" ")}` : ""
      }`;
    });
  }

  function onImportIntoDeck() {
    setImportErr(null);
    setImportMsg(null);
    setImportBusy(true);
    const v = validateImportedList(importText);
    setImportBusy(false);
    if (!v.ok || !v.leaderId) {
      setImportErr(v.errors.join(" · ") || "Import failed");
      return;
    }
    // Replaces the draft only; Save keeps it.
    onChangeDraft({ leaderId: v.leaderId, cards: v.cards });
    setImportText("");
    setImportMsg(
      `Imported (${v.cards.length} main), not saved yet${
        v.warnings.length ? ` — ${v.warnings.join(" ")}` : ""
      }`,
    );
  }

  return (
    <div className="app-shell">
      <div className="deck-config deck-config-wide">
        <header className="deck-config-header">
          <NavMenu />
          <BackLink to="/decks" label="Decks" ariaLabel="Back to decks" />
          <div className="deck-config-heading">
            <h1 className="deck-config-title">{deck.name}</h1>
            <p className="meta">
              Leader {lookupCard(deck.leaderId).name} · {deck.cards.length}/{MAX_MAIN_DECK_SIZE} main
            </p>
          </div>
          <div className="deck-planner-actions deck-header-actions">
            <button type="button" className="btn btn-secondary deck-discard-btn" onClick={onDiscard} disabled={!dirty}>
              Discard
            </button>
            <button
              type="button"
              className="btn btn-primary deck-save-btn"
              onClick={() => commit(draft)}
              disabled={!dirty}
            >
              {dirty ? "Save" : "Saved"}
            </button>
            {signedIn !== false || deck.plannerDeckId ? (
              <>
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
                  disabled={plannerBusy || dirty}
                  title={dirty ? "Save your edits first" : undefined}
                >
                  {plannerBusy ? "Saving…" : "Save to planner"}
                </button>
              ) : null}
              </>
            ) : null}
          </div>
        </header>

        {/* Announced to screen readers; the Save button already shows the state, so nothing shifts. */}
        <p className="visually-hidden" role="status">
          {saveMsg}
        </p>
        {saveErr ? <p className="error-text deck-config-notice">{saveErr}</p> : null}
        {plannerErr ? <p className="error-text deck-config-notice">{plannerErr}</p> : null}
        {notice ? <p className="meta deck-config-notice">{notice}</p> : null}

        <DeckEditor
          deck={deck}
          onChange={onChangeDraft}
          onArtChanged={refresh}
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

      {leave.pending ? (
        <div className="leave-dialog-backdrop" onClick={leave.clear}>
          <div
            className="leave-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-dialog-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") leave.clear();
            }}
          >
            <h2 id="leave-dialog-title">Save changes to {deck.name}?</h2>
            <p className="meta">You have edits that are not saved yet.</p>
            <div className="leave-dialog-actions">
              <button type="button" className="btn btn-primary" autoFocus onClick={() => leaveTo(leave.pending!, true)}>
                Save
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => leaveTo(leave.pending!, false)}>
                Discard
              </button>
              <button type="button" className="btn btn-secondary" onClick={leave.clear}>
                Keep editing
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
