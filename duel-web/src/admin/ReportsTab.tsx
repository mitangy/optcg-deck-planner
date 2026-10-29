import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  type ReportRow,
  banReport,
  dismissReport,
  fetchAdminReports,
  fetchReportImageUrl,
  removeReportImage,
  warnReport,
} from "./adminApi";
import { DEFAULT_WARNING, REPORT_REASON_LABELS, REPORT_SOURCE_LABELS, handledLine, reportActionBlock, stampOf } from "./adminLogic";
import type { Actor } from "./UsersTab";

type Filter = "open" | "all";
type Panel = "warn" | "ban" | null;

/** The snapshot of a reported image, fetched with the staff cookie. Blurred until a moderator asks to see it. */
function ReportImage({ report }: { report: ReportRow }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!report.has_image) return;
    let live = true;
    let made: string | null = null;
    fetchReportImageUrl(report.id)
      .then((u) => {
        made = u;
        if (live) setUrl(u);
        else URL.revokeObjectURL(u);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [report.id, report.has_image]);

  if (!report.has_image) {
    return report.reason === "image" ? <p className="adm-muted rpt-noimg">No image was saved with this report.</p> : null;
  }
  return (
    <div className="rpt-image">
      <div className="rpt-image-frame" data-kind={report.image_kind ?? undefined} data-shown={shown ? "true" : "false"}>
        {url ? <img src={url} alt={shown ? `Reported ${report.image_kind === "cardBack" ? "card back" : "playmat"}` : ""} /> : <span className="adm-muted">{failed ? "Could not load the image." : "Loading image…"}</span>}
      </div>
      <button type="button" className="btn btn-secondary btn-sm rpt-reveal" disabled={!url} aria-pressed={shown} onClick={() => setShown((v) => !v)}>
        {shown ? "Hide image" : "Show image"}
      </button>
    </div>
  );
}

function ReportCard({ report, actor, onChange }: { report: ReportRow; actor: Actor; onChange: (next: ReportRow) => void }) {
  const [panel, setPanel] = useState<Panel>(null);
  const [warning, setWarning] = useState(DEFAULT_WARNING);
  const [banReason, setBanReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = report.status === "open";
  const block = reportActionBlock(actor, report.reported);
  const r = report.reported;
  const handled = handledLine(report);

  async function act(run: () => Promise<ReportRow>) {
    setBusy(true);
    setError(null);
    try {
      onChange(await run());
      setPanel(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rpt-card" data-status={report.status} aria-label={`Report ${report.id} against ${r.name}`}>
      <header className="rpt-head">
        <div className="rpt-who">
          <b className="rpt-name">{r.name}</b>
          {r.role !== "user" ? <span className="adm-pill adm-pill-ok">{r.role}</span> : null}
          {r.banned ? <span className="adm-pill adm-pill-bad">Banned</span> : null}
        </div>
        <span className="rpt-counts">
          {r.open_reports} open / {r.total_reports} total reports, {r.warnings} {r.warnings === 1 ? "warning" : "warnings"}
        </span>
      </header>

      <div className="rpt-badges">
        <span className="adm-pill rpt-reason" data-reason={report.reason}>{REPORT_REASON_LABELS[report.reason] ?? report.reason}</span>
        {report.reason === "image" && report.image_kind ? <span className="adm-pill adm-pill-mid">{report.image_kind === "cardBack" ? "Card back" : "Playmat"}</span> : null}
        {report.image_taken_down ? <span className="adm-pill adm-pill-bad">Taken down</span> : null}
        {!open ? <span className="adm-pill adm-pill-mid">{report.status === "dismissed" ? "Dismissed" : "Handled"}</span> : null}
      </div>

      {report.note ? <p className="rpt-note">{report.note}</p> : null}

      <ReportImage report={report} />

      <p className="rpt-meta">
        <span>Reported by {report.reporter ? report.reporter.name : "a deleted account"}</span>
        <span>{REPORT_SOURCE_LABELS[report.source] ?? report.source}</span>
        <span>{stampOf(report.created_at)}</span>
        {report.match_id ? (
          report.match_finished ? (
            <Link to={`/replay/${encodeURIComponent(report.match_id)}`} className="rpt-match">
              Match {report.match_id}
            </Link>
          ) : (
            <span className="rpt-match">Match {report.match_id}</span>
          )
        ) : null}
      </p>

      {handled ? (
        <p className="rpt-handled">
          {handled}
          {report.staff_note ? <span className="rpt-staffnote"> · {report.staff_note}</span> : null}
        </p>
      ) : null}

      {open ? (
        <>
          <div className="rpt-actions">
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void act(() => dismissReport(report.id))}>
              Dismiss
            </button>
            {report.has_image || report.reason === "image" ? (
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void act(() => removeReportImage(report.id))}>
                Remove image
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy || block !== null}
              title={block ?? undefined}
              aria-expanded={panel === "warn"}
              onClick={() => setPanel((p) => (p === "warn" ? null : "warn"))}
            >
              Warn
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm rpt-ban"
              disabled={busy || block !== null}
              title={block ?? undefined}
              aria-expanded={panel === "ban"}
              onClick={() => setPanel((p) => (p === "ban" ? null : "ban"))}
            >
              Ban
            </button>
          </div>
          {panel === "warn" ? (
            <form
              className="rpt-panel"
              onSubmit={(e) => {
                e.preventDefault();
                if (warning.trim()) void act(() => warnReport(report.id, warning));
              }}
            >
              <label className="rpt-field">
                <span>Warning shown to {r.name}</span>
                <textarea value={warning} maxLength={300} rows={3} onChange={(e) => setWarning(e.target.value)} />
              </label>
              <div className="rpt-panel-actions">
                <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !warning.trim()}>
                  Send warning
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPanel(null)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : null}
          {panel === "ban" ? (
            <form
              className="rpt-panel"
              onSubmit={(e) => {
                e.preventDefault();
                void act(() => banReport(report.id, banReason));
              }}
            >
              <label className="rpt-field">
                <span>Ban {r.name}? They are signed out everywhere and cannot sign in. Reason (optional, staff only)</span>
                <input type="text" value={banReason} maxLength={200} onChange={(e) => setBanReason(e.target.value)} />
              </label>
              <div className="rpt-panel-actions">
                <button type="submit" className="btn btn-primary btn-sm rpt-ban-confirm" disabled={busy}>
                  Confirm ban
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPanel(null)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : null}
        </>
      ) : null}
      {open && block ? <p className="adm-note">{block}</p> : null}
      <p className="adm-error rpt-error" role="alert">
        {error ?? ""}
      </p>
    </article>
  );
}

export function ReportsTab({ actor }: { actor: Actor }) {
  const [filter, setFilter] = useState<Filter>("open");
  const [state, setState] = useState<{ status: "loading" } | { status: "error"; message: string } | { status: "ready"; reports: ReportRow[] }>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);

  const load = useCallback((f: Filter) => {
    const mine = ++seq.current;
    setRefreshing(true);
    fetchAdminReports(f)
      .then((reports) => mine === seq.current && setState({ status: "ready", reports }))
      .catch((e: Error) => mine === seq.current && setState((s) => (s.status === "ready" ? s : { status: "error", message: e.message })))
      .finally(() => mine === seq.current && setRefreshing(false));
  }, []);

  useEffect(() => load(filter), [filter, load]);

  // A handled report stays where it is, so the list does not jump under the cursor; Refresh drops it from "Open".
  const replace = (next: ReportRow) =>
    setState((s) => (s.status === "ready" ? { status: "ready", reports: s.reports.map((x) => (x.id === next.id ? next : x)) } : s));

  const reports = state.status === "ready" ? state.reports : [];
  const openCount = reports.filter((r) => r.status === "open").length;
  return (
    <section className="panel rpt" aria-label="Reports">
      <div className="adm-toolbar">
        <div className="segmented rpt-filter" role="radiogroup" aria-label="Show reports">
          {(["open", "all"] as const).map((f) => (
            <button key={f} type="button" role="radio" aria-checked={filter === f} className={filter === f ? "active" : ""} onClick={() => setFilter(f)}>
              {f === "open" ? "Open" : "All"}
            </button>
          ))}
        </div>
        <span className="adm-count" aria-live="polite">
          {state.status === "ready" ? `${openCount} open · ${reports.length} shown` : " "}
        </span>
        <button type="button" className="btn btn-secondary btn-sm adm-refresh" onClick={() => load(filter)} disabled={refreshing} aria-busy={refreshing}>
          Refresh
        </button>
      </div>
      {state.status === "loading" ? <p className="panel-copy adm-muted">Loading reports…</p> : null}
      {state.status === "error" ? (
        <p className="adm-error" role="alert">
          Could not load reports: {state.message}
        </p>
      ) : null}
      {state.status === "ready" && reports.length === 0 ? <p className="panel-copy adm-muted">{filter === "open" ? "No open reports." : "No reports yet."}</p> : null}
      <div className="rpt-list">
        {reports.map((r) => (
          <ReportCard key={r.id} report={r} actor={actor} onChange={replace} />
        ))}
      </div>
    </section>
  );
}
