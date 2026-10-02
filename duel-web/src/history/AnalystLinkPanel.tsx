import { useEffect, useState } from "react";
import { createAnalystLink, fetchAnalystLink, revokeAnalystLink } from "./historyApi";

/** Settings panel: make, copy or turn off your personal Log Pose connector link for Claude. */
export function AnalystLinkPanel() {
  const [hasLink, setHasLink] = useState<boolean | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchAnalystLink()
      .then((s) => setHasLink(s.has_token))
      .catch(() => setHasLink(false));
  }, []);

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
        decks and review your games turn by turn. Treat it like a password.
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
      {error ? (
        <p className="field-hint" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
