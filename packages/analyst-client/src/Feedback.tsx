import { useCallback, useEffect, useId, useReducer, useRef, useState } from "react";
import {
  CLOSED_FORM,
  FEEDBACK_ERROR,
  NOTE_MAX,
  fetchVotes,
  formReducer,
  postFeedback,
  statusText,
  targetKey,
  type FeedbackTarget,
  type Rating,
  type Vote,
} from "./feedback";

/**
 * The player's votes on a thread's answers (or on one game's review) and a way to cast one. Votes load once per
 * thread/game; one cast here replaces the loaded one for that answer.
 */
export function useFeedback(apiBase: string, scope: { threadId: number } | { matchId: string } | null) {
  const [votes, setVotes] = useState<ReadonlyMap<string, Vote>>(new Map());
  const scopeKey = scope === null ? "" : "threadId" in scope ? `t${scope.threadId}` : `m${scope.matchId}`;
  useEffect(() => {
    setVotes(new Map());
    if (scope === null) return;
    let live = true;
    void fetchVotes(apiBase, scope).then((loaded) => {
      // A vote cast while this was loading is newer than what was loaded.
      if (live) setVotes((cur) => new Map([...loaded, ...cur]));
    });
    return () => {
      live = false;
    };
    // `scope` is an object made each render; its key says when it changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase, scopeKey]);
  const rate = useCallback(
    async (target: FeedbackTarget, rating: Rating, note: string) => {
      const vote = await postFeedback(apiBase, target, rating, note);
      setVotes((cur) => new Map(cur).set(targetKey(target), vote));
    },
    [apiBase],
  );
  /** Drop the vote shown for an answer that was written again, so the new one starts unrated. */
  const forget = useCallback((target: FeedbackTarget) => {
    setVotes((cur) => {
      const next = new Map(cur);
      next.delete(targetKey(target));
      return next;
    });
  }, []);
  return { votes, rate, forget };
}

function Thumb({ down, filled }: { down?: boolean; filled: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false" className="lp-fb-icon" data-filled={filled || undefined}>
      <g transform={down ? "rotate(180 10 10)" : undefined}>
        <path d="M7 9.5V17H4a1 1 0 0 1-1-1v-5.5a1 1 0 0 1 1-1h3zm0 0 3.2-6.2a1.6 1.6 0 0 1 3 .9L12.6 8H16a1.5 1.5 0 0 1 1.46 1.84l-1.2 5.4A2 2 0 0 1 14.3 17H7" />
      </g>
    </svg>
  );
}

/**
 * 👍, 👎 and "This is wrong" under a finished answer. Controlled: `vote` is what the player chose, `onSend` saves a
 * choice (and throws the text to show if it can't). Its parts never change size when a vote is saved or the note form
 * opens: the status text has a slot of its own, and the form is the only thing that opens, below the buttons.
 */
export function FeedbackBar({ vote, onSend, what }: { vote?: Vote; onSend: (rating: Rating, note: string) => Promise<void>; what: string }) {
  const [form, dispatch] = useReducer(formReducer, CLOSED_FORM);
  const [pending, setPending] = useState<Rating | null>(null);
  const [error, setError] = useState<string | null>(null);
  const formId = useId();
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const wrongRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!form.open) return;
    noteRef.current?.focus({ preventScroll: true });
    formRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [form.open]);

  const shown = pending ?? vote?.rating ?? null;

  const quick = async (rating: Rating) => {
    if (pending || form.sending || shown === rating) return;
    dispatch({ type: "close" });
    setPending(rating);
    setError(null);
    try {
      await onSend(rating, "");
    } catch (e) {
      if (mounted.current) setError(e instanceof Error && e.message ? e.message : FEEDBACK_ERROR);
    } finally {
      if (mounted.current) setPending(null);
    }
  };

  const toggleWrong = () => {
    if (form.open) {
      dispatch({ type: "close" });
      return;
    }
    setError(null);
    dispatch({ type: "open", note: vote?.rating === "wrong" ? vote.note : "" });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.sending) return;
    dispatch({ type: "sending" });
    try {
      await onSend("wrong", form.note);
      if (!mounted.current) return;
      dispatch({ type: "sent" });
      wrongRef.current?.focus({ preventScroll: true });
    } catch (err) {
      if (mounted.current) dispatch({ type: "failed", error: err instanceof Error && err.message ? err.message : FEEDBACK_ERROR });
    }
  };

  const status = statusText(vote, error ?? form.error, pending !== null || form.sending);
  const failed = Boolean(error ?? form.error);

  return (
    <div className="lp-fb" role="group" aria-label={`Rate ${what}`}>
      <div className="lp-fb-row">
        <button type="button" className="lp-fb-btn lp-fb-icon-btn" aria-pressed={shown === "up"} aria-label="Good answer" title="Good answer" onClick={() => void quick("up")}>
          <Thumb filled={shown === "up"} />
        </button>
        <button type="button" className="lp-fb-btn lp-fb-icon-btn" aria-pressed={shown === "down"} aria-label="Not helpful" title="Not helpful" onClick={() => void quick("down")}>
          <Thumb down filled={shown === "down"} />
        </button>
        <button
          ref={wrongRef}
          type="button"
          className="lp-fb-btn lp-fb-wrong"
          aria-pressed={shown === "wrong"}
          aria-expanded={form.open}
          aria-controls={form.open ? formId : undefined}
          onClick={toggleWrong}
        >
          This is wrong
        </button>
        <span className="lp-fb-status" role={failed ? "alert" : "status"} data-error={failed || undefined}>
          {status}
        </span>
      </div>
      {form.open ? (
        <form
          id={formId}
          ref={formRef}
          className="lp-fb-form"
          onSubmit={(e) => void submit(e)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              dispatch({ type: "close" });
              wrongRef.current?.focus({ preventScroll: true });
            }
          }}
        >
          <label className="lp-fb-label" htmlFor={`${formId}-note`}>
            What was wrong? (optional)
          </label>
          <textarea
            id={`${formId}-note`}
            ref={noteRef}
            className="lp-input lp-fb-note"
            rows={3}
            maxLength={NOTE_MAX}
            value={form.note}
            disabled={form.sending}
            placeholder="For example: the card costs 4, not 3."
            onChange={(e) => dispatch({ type: "note", note: e.target.value })}
          />
          <div className="lp-fb-form-foot">
            <span className="lp-fb-count" aria-hidden="true">
              {form.note.length}/{NOTE_MAX}
            </span>
            <button type="button" className="lp-btn lp-btn-quiet lp-fb-action" disabled={form.sending} onClick={() => dispatch({ type: "close" })}>
              Cancel
            </button>
            <button type="submit" className="lp-btn lp-btn-send lp-fb-action" disabled={form.sending}>
              {form.sending ? "Sending…" : "Send"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
