import { useCallback, useEffect, useRef, useState } from "react";
import { AnalystError, errorText, fetchSavedReview, Markdown, streamAnalyst, useLogPose } from "@optcg/analyst-client";
import { reviewMode } from "../logPose";

type ReviewState =
  | { kind: "loading" }
  | { kind: "streaming"; text: string; status: string }
  | { kind: "ready"; text: string }
  | { kind: "error"; text: string; message: string };

/**
 * "Log Pose analysis" above the turn log: the saved post-game review, generated (and streamed
 * in) the first time the page opens when none is saved. Nothing at all while chat is off.
 */
export function LogPoseReview({ matchId, finished }: { matchId: string; finished: boolean | undefined }) {
  const { enabled, apiBase, session } = useLogPose();
  const mode = reviewMode(enabled, finished);
  const [state, setState] = useState<ReviewState>({ kind: "loading" });
  const [collapsed, setCollapsed] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const generate = useCallback(
    async (regenerate: boolean) => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      setCollapsed(false);
      setState({ kind: "streaming", text: "", status: "" });
      let text = "";
      let failure: string | null = null;
      try {
        await streamAnalyst(
          session,
          "/review-match",
          regenerate ? { match_id: matchId, regenerate: true } : { match_id: matchId },
          {
            onStatus: (status) => setState((s) => (s.kind === "streaming" ? { ...s, status } : s)),
            onText: (delta) => {
              text += delta;
              setState((s) => (s.kind === "streaming" ? { ...s, text } : s));
            },
            onError: (e) => {
              failure = errorText(e);
            },
          },
          ctrl.signal,
        );
      } catch (e) {
        if (ctrl.signal.aborted) return;
        failure = e instanceof AnalystError ? errorText(e) : errorText({});
      }
      if (abort.current !== ctrl) return;
      abort.current = null;
      setState(failure || !text.trim() ? { kind: "error", text, message: failure ?? "Log Pose didn't write a review this time." } : { kind: "ready", text });
    },
    [matchId, session],
  );

  useEffect(() => {
    if (mode !== "auto") return;
    let live = true;
    setState({ kind: "loading" });
    fetchSavedReview(apiBase, matchId)
      .then((saved) => {
        if (!live) return;
        if (saved?.text) setState({ kind: "ready", text: saved.text });
        else void generate(false);
      })
      .catch(() => live && setState({ kind: "error", text: "", message: "Could not load the saved review." }));
    return () => {
      live = false;
      abort.current?.abort();
      abort.current = null;
    };
  }, [mode, apiBase, matchId, generate]);

  if (mode === "hidden") return null;
  if (mode === "cut-off") {
    return (
      <p className="field-hint history-hint lp-review-note">
        Log Pose reviews finished games only. This one was cut off, so there is no analysis.
      </p>
    );
  }

  const busy = state.kind === "loading" || state.kind === "streaming";
  const text = state.kind === "loading" ? "" : state.text;
  return (
    <section className="panel lp-review logpose" aria-labelledby="lp-review-title" aria-busy={busy}>
      <div className="lp-review-head">
        <h2 id="lp-review-title" className="lp-review-title">
          Log Pose analysis
        </h2>
        <div className="lp-review-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void generate(true)} disabled={busy}>
            {state.kind === "error" ? "Try again" : "Regenerate"}
          </button>
          {/* Always in the row (invisible until the review is ready) so the header never changes height. */}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            style={state.kind === "ready" ? undefined : { visibility: "hidden" }}
            tabIndex={state.kind === "ready" ? undefined : -1}
            aria-hidden={state.kind === "ready" ? undefined : true}
          >
            {collapsed ? "Show" : "Hide"}
          </button>
        </div>
      </div>
      <div className={`lp-review-body${collapsed ? " lp-review-collapsed" : ""}`} data-state={state.kind}>
        {busy ? (
          <p className="lp-review-status" role="status">
            <span className="lp-status-dot" aria-hidden="true" />
            <span className="lp-review-status-text">
              {state.kind === "loading" ? "Checking for a saved review…" : state.status || "Reviewing the game…"}
            </span>
          </p>
        ) : null}
        {text ? <Markdown text={text} /> : null}
        {state.kind === "error" ? (
          <p className="panel-copy lp-review-error" role="alert">
            {state.message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
