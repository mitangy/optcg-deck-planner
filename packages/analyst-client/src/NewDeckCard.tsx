import { useContext, useEffect, useState } from "react";
import { deckListText, markDraftOpened, readOpenedDrafts, shouldAutoOpen, type NewDeckDraft } from "./drafts";
import { SourceHooksContext } from "./Sources";

const MAX_PROBLEMS = 3;

type Opened = "auto" | "button" | "refused" | "failed" | null;

/**
 * What Log Pose's `propose_new_deck` shows under an answer (#726): the new deck, and a button that opens the app's create-deck page with
 * its name and list filled in. A live draft opens that page once by itself; a draft reloaded with the thread never does.
 */
export function NewDeckCard({
  draft,
  live = false,
  onOpened,
}: {
  draft: NewDeckDraft;
  /** The draft arrived in this session's answer, not from a saved thread. */
  live?: boolean;
  /** The create page opened (by itself or from the button): the panel can get out of the way (phones). */
  onOpened?: () => void;
}) {
  const hooks = useContext(SourceHooksContext);
  const [opened, setOpened] = useState<Opened>(null);
  const target = { name: draft.name, list: deckListText(draft) };

  // Marked before navigating, so a re-render or a reload never opens it twice, and an app that refuses (a live game) is not asked again.
  useEffect(() => {
    if (!hooks.openNewDeck || !shouldAutoOpen(draft, readOpenedDrafts(), live)) return;
    markDraftOpened(draft.id);
    const ok = hooks.openNewDeck(target, { auto: true });
    setOpened(ok ? "auto" : "refused");
    if (ok) onOpened?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = () => {
    if (!hooks.openNewDeck) return;
    const ok = hooks.openNewDeck(target, { auto: false });
    setOpened(ok ? "button" : "failed");
    if (ok) onOpened?.();
  };

  const { legality } = draft;
  const shownProblems = legality.problems.slice(0, MAX_PROBLEMS);
  const hiddenProblems = legality.problems.length - shownProblems.length;
  const leaderArt = hooks.card?.(draft.leaderId);
  const note =
    opened === "refused"
      ? "Open the deck builder after your game."
      : opened === "failed"
        ? "Couldn't open the deck builder here."
        : opened === "auto" || opened === "button"
          ? "Opened. Check it, then press Create."
          : "Opens the deck builder with this list filled in.";

  return (
    <section className="lp-edit lp-draft" aria-label={`New deck ${draft.name}`}>
      <h3 className="lp-edit-head">
        <span className="lp-edit-head-text">New deck · {draft.name}</span>
      </h3>
      <p className="lp-draft-leader">
        {hooks.card ? (
          <span className="lp-edit-thumb" aria-hidden="true">
            {leaderArt?.imageUrl ? <img src={leaderArt.imageUrl} alt="" loading="lazy" decoding="async" onError={(e) => (e.currentTarget.style.visibility = "hidden")} /> : null}
          </span>
        ) : null}
        <span className="lp-draft-leader-text">
          Leader: <strong>{leaderArt?.name ?? draft.leaderName}</strong> <span className="lp-edit-id">{draft.leaderId}</span>
        </span>
      </p>
      {draft.summary ? <p className="lp-edit-summary">{draft.summary}</p> : null}
      <details className="lp-draft-list">
        <summary>{draft.count} cards</summary>
        <ul className="lp-draft-rows">
          {draft.cards.map((c) => {
            const art = hooks.card?.(c.id);
            return (
              <li key={c.id} className="lp-draft-row">
                <span className="lp-edit-badge">{c.copies}×</span>
                <span className="lp-edit-name">
                  {hooks.card ? (
                    <span className="lp-edit-thumb" aria-hidden="true">
                      {art?.imageUrl ? <img src={art.imageUrl} alt="" loading="lazy" decoding="async" onError={(e) => (e.currentTarget.style.visibility = "hidden")} /> : null}
                    </span>
                  ) : null}
                  <span className="lp-edit-name-text" title={`${art?.name ?? c.name} (${c.id})`}>
                    {art?.name ?? c.name} <span className="lp-edit-id">{c.id}</span>
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </details>

      <div className="lp-edit-legal" data-legal={legality.legal ? "true" : "false"}>
        {legality.legal ? (
          <p className="lp-edit-ok">✓ Legal · {draft.count} cards</p>
        ) : (
          <>
            <p className="lp-edit-bad">Not legal:</p>
            <ul className="lp-edit-problems">
              {shownProblems.map((p) => (
                <li key={p}>{p}</li>
              ))}
              {hiddenProblems > 0 ? <li>and {hiddenProblems} more</li> : null}
            </ul>
          </>
        )}
        {legality.upcoming.map((u) => (
          <p key={u} className="lp-edit-muted">
            {u}
          </p>
        ))}
        {!legality.banListChecked ? <p className="lp-edit-muted">Ban list couldn't be checked</p> : null}
      </div>

      <div className="lp-edit-actions">
        <button type="button" className="lp-btn lp-edit-btn lp-edit-primary lp-draft-open" onClick={open} disabled={!hooks.openNewDeck}>
          Open in deck builder
        </button>
      </div>
      <p className="lp-edit-status lp-draft-note" role="status" aria-live="polite">
        {note}
      </p>
    </section>
  );
}
