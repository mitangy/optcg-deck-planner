import { useContext, useState } from "react";
import { SourceHooksContext } from "./Sources";
import {
  applyOps,
  proposalState,
  readDismissed,
  undoOps,
  writeDismissed,
  type DeckEditOp,
  type DeckEditor,
  type DeckEditProposal,
} from "./proposals";

const MAX_PROBLEMS = 3;
const MINUS = "−";

const errorMessage = (e: unknown) => (e instanceof Error && e.message.trim() ? e.message.trim() : "Couldn't save that change. Nothing was changed.");

/** What Log Pose's `propose_deck_edit` shows under an answer: the changes with their reasons, the legality result and Apply / Dismiss (#400). */
export function DeckEditCard({
  proposal,
  editor,
  onAskAgain,
  busy = false,
}: {
  proposal: DeckEditProposal;
  /** The deck the app has open (null where no deck editor is mounted). */
  editor: DeckEditor | null;
  /** Sends the "my deck changed" follow-up through the panel. */
  onAskAgain?: () => void;
  /** Log Pose is answering: Ask again waits. */
  busy?: boolean;
}) {
  const hooks = useContext(SourceHooksContext);
  const [dismissed, setDismissed] = useState(() => readDismissed().includes(proposal.id));
  const [working, setWorking] = useState<"apply" | "undo" | null>(null);
  const [error, setError] = useState("");
  const state = proposalState(proposal, editor, dismissed ? [proposal.id] : []);
  const { kind } = state;
  const here = kind !== "elsewhere";

  const run = async (ops: DeckEditOp[], as: "apply" | "undo") => {
    if (!editor || working) return;
    setWorking(as);
    setError("");
    try {
      await editor.apply(ops);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setWorking(null);
    }
  };

  const dismiss = (on: boolean) => {
    setDismissed(on);
    writeDismissed(proposal.id, on);
  };

  const { legality } = proposal;
  const shownProblems = legality.problems.slice(0, MAX_PROBLEMS);
  const hiddenProblems = legality.problems.length - shownProblems.length;
  const href = !here ? hooks.deckHref?.(proposal.target.ref) : null;
  const status = error || (kind === "ready" && state.drifted ? "Your deck changed since; this check was for the earlier list." : "");

  return (
    <section className="lp-edit" data-state={kind} aria-label={`Suggested edit for ${proposal.target.name}`}>
      <h3 className="lp-edit-head">
        <span className="lp-edit-head-text">Suggested edit · {proposal.target.name}</span>
      </h3>
      {proposal.summary ? <p className="lp-edit-summary">{proposal.summary}</p> : null}
      <ul className="lp-edit-rows">
        {proposal.lines.map((l) => {
          const add = l.after > l.before;
          const owned = here && add ? editor?.owned?.(l.id) : undefined;
          const art = hooks.card ? hooks.card(l.id) : undefined;
          return (
            <li key={l.id} className="lp-edit-row" data-dir={add ? "add" : "remove"}>
              <span className="lp-edit-badge">{add ? `+${l.after - l.before}` : `${MINUS}${l.before - l.after}`}</span>
              <span className="lp-edit-name">
                {hooks.card ? (
                  <span className="lp-edit-thumb" aria-hidden="true">
                    {art?.imageUrl ? <img src={art.imageUrl} alt="" loading="lazy" decoding="async" onError={(e) => (e.currentTarget.style.visibility = "hidden")} /> : null}
                  </span>
                ) : null}
                <span className="lp-edit-name-text" title={`${art?.name ?? l.name} (${l.id})`}>
                  {art?.name ?? l.name} <span className="lp-edit-id">{l.id}</span>
                </span>
              </span>
              <span className="lp-edit-count">
                {l.before} → {l.after}
              </span>
              {l.reason ? <span className="lp-edit-reason">{l.reason}</span> : null}
              {owned !== undefined ? (
                <span className="lp-edit-own" data-short={l.after > owned ? "true" : undefined}>
                  {l.after > owned ? `own ${owned} of ${l.after}` : `own ${owned}`}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="lp-edit-legal" data-legal={legality.legal ? "true" : "false"}>
        {legality.legal ? (
          <p className="lp-edit-ok">✓ Legal after this change · {legality.count} cards</p>
        ) : (
          <>
            <p className="lp-edit-bad">Still not legal:</p>
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
        {here && editor?.note ? <p className="lp-edit-muted">{editor.note}</p> : null}
      </div>

      <div className="lp-edit-actions">
        {kind === "ready" ? (
          <>
            <button type="button" className="lp-btn lp-edit-btn lp-edit-primary" onClick={() => void run(applyOps(proposal), "apply")} disabled={working !== null} aria-busy={working === "apply"}>
              {working === "apply" ? "Applying…" : "Apply"}
            </button>
            <button type="button" className="lp-btn lp-edit-btn" onClick={() => dismiss(true)} disabled={working !== null}>
              Dismiss
            </button>
          </>
        ) : null}
        {kind === "applied" ? (
          <>
            <span className="lp-edit-done">✓ Applied</span>
            <button type="button" className="lp-btn lp-edit-btn" onClick={() => void run(undoOps(proposal), "undo")} disabled={working !== null} aria-busy={working === "undo"}>
              {working === "undo" ? "Undoing…" : "Undo"}
            </button>
          </>
        ) : null}
        {kind === "conflict" ? (
          <>
            <span className="lp-edit-note" title={state.changed.map((c) => `${c.id} is now ${c.now}`).join(", ")}>
              Changed since: {state.changed.map((c) => `${c.id} is now ${c.now}`).join(", ")}
            </span>
            <button type="button" className="lp-btn lp-edit-btn" onClick={onAskAgain} disabled={busy || !onAskAgain}>
              Ask again
            </button>
          </>
        ) : null}
        {kind === "elsewhere" ? (
          <span className="lp-edit-note">
            {href ? (
              <a className="lp-edit-link" href={href}>
                Open {proposal.target.name} to apply
              </a>
            ) : (
              <>Open {proposal.target.name} to apply</>
            )}
          </span>
        ) : null}
        {kind === "dismissed" ? (
          <>
            <span className="lp-edit-note">Dismissed</span>
            <button type="button" className="lp-btn lp-edit-btn" onClick={() => dismiss(false)}>
              Restore
            </button>
          </>
        ) : null}
      </div>
      <p className="lp-edit-status" role="status" aria-live="polite" data-error={error ? "true" : undefined}>
        {status}
      </p>
    </section>
  );
}
