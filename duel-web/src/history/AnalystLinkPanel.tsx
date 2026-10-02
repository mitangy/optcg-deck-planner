import { useEffect, useMemo, useState } from "react";
import { lookupCard } from "../cards/atlas";
import {
  createAnalystLink,
  deleteAnalystLesson,
  fetchAnalystLessons,
  fetchAnalystLink,
  fetchAnalystSharing,
  reviewAnalystLesson,
  revokeAnalystLink,
  setAnalystSharing,
  type AnalystLesson,
  type AnalystLessonStatus,
} from "./historyApi";
import { lessonRows } from "./lessonRow";

const cardName = (id: string) => lookupCard(id).name || id;
const STATUS_LABEL: Record<AnalystLessonStatus, string> = { draft: "Needs review", approved: "Approved", rejected: "Rejected" };

/**
 * Settings panel: your personal Log Pose connector link for Claude, whether your games count in
 * its matchup stats, and the lessons Claude drafted for you to approve.
 */
export function AnalystLinkPanel() {
  const [hasLink, setHasLink] = useState<boolean | null>(null);
  const [sharing, setSharing] = useState<boolean | null>(null);
  const [lessons, setLessons] = useState<AnalystLesson[] | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchAnalystLink()
      .then((s) => setHasLink(s.has_token))
      .catch(() => setHasLink(false));
    void fetchAnalystSharing()
      .then(setSharing)
      .catch(() => setSharing(null));
    void fetchAnalystLessons()
      .then(setLessons)
      .catch(() => setLessons([]));
  }, []);

  const rows = useMemo(() => lessonRows(lessons ?? [], cardName), [lessons]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const make = () =>
    run(async () => {
      const made = await createAnalystLink();
      if (!made.connector_url) throw new Error("Log Pose isn't set up on this server yet.");
      setUrl(made.connector_url);
      setHasLink(true);
      setCopied(false);
    });

  const turnOff = () =>
    run(async () => {
      await revokeAnalystLink();
      setUrl(null);
      setHasLink(false);
    });

  const toggleSharing = (share: boolean) =>
    run(async () => {
      setSharing(await setAnalystSharing(share));
    });

  const review = (id: number, status: AnalystLessonStatus) =>
    run(async () => {
      const saved = await reviewAnalystLesson(id, status);
      setLessons((prev) => (prev ?? []).map((l) => (l.id === id ? saved : l)));
    });

  const remove = (id: number) =>
    run(async () => {
      await deleteAnalystLesson(id);
      setLessons((prev) => (prev ?? []).filter((l) => l.id !== id));
    });

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError("Couldn't copy. Select the link and copy it instead.");
    }
  }

  return (
    <section className="panel" aria-labelledby="analyst-title">
      <h2 className="panel-title" id="analyst-title">Log Pose (Claude)</h2>
      <p className="panel-copy">
        Add this link to Claude as a custom connector (Settings, then Connectors) and Claude can read your
        decks, review your games turn by turn and draft lessons from them. Treat it like a password.
      </p>
      {url ? (
        <div className="analyst-link-row">
          <input readOnly value={url} aria-label="Your Log Pose link" onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className="btn btn-secondary" onClick={() => void copy()}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      ) : hasLink ? (
        <p className="field-hint">You have a link. Making a new one stops the old one.</p>
      ) : null}
      <div className="btn-row">
        <button type="button" className="btn btn-primary" disabled={busy || hasLink === null} onClick={() => void make()}>
          {hasLink ? "Make a new link" : "Make my link"}
        </button>
        {hasLink ? (
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void turnOff()}>
            Turn off
          </button>
        ) : null}
      </div>
      <div className="gameplay-toggle">
        <label className="switch">
          <input
            type="checkbox"
            checked={sharing ?? true}
            disabled={busy || sharing === null}
            onChange={(e) => void toggleSharing(e.target.checked)}
          />
          <span>Count my games in Log Pose stats</span>
        </label>
        <p className="field-hint">
          Claude only ever sees totals across at least 5 games, never your games one by one. Turn this off and your
          games are left out of everyone's stats.
        </p>
      </div>
      <h3 className="analyst-subtitle">Lessons from your games</h3>
      {lessons === null ? (
        <p className="field-hint">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="field-hint">
          None yet. Ask Claude to review your recent games and draft lessons; they show up here for you to approve.
          Claude only uses the ones you approve.
        </p>
      ) : (
        <ul className="lesson-list">
          {rows.map((r) => (
            <li key={r.id} className="lesson-row" data-status={r.status}>
              <p className="lesson-meta">
                <span className="lesson-status">{STATUS_LABEL[r.status]}</span>
                {r.about ? <span className="lesson-about">{r.about}</span> : null}
              </p>
              <p className="lesson-text">{r.text}</p>
              {r.cards.length ? <p className="lesson-cards">{r.cards.join(", ")}</p> : null}
              <div className="lesson-actions">
                {r.actions.map((a) => (
                  <button
                    key={a.status}
                    type="button"
                    className={a.status === "approved" ? "btn btn-primary" : "btn btn-secondary"}
                    disabled={busy}
                    onClick={() => void review(r.id, a.status)}
                  >
                    {a.label}
                  </button>
                ))}
                <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void remove(r.id)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <p className="field-hint" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
