import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogTitle, Select } from "@optcg/ui/popups";
import {
  type UploadKind,
  type UploadRow,
  type UploadState,
  fetchAdminUploads,
  fetchUploadImageUrl,
  restoreUpload,
  takeDownUpload,
} from "./adminApi";
import { TAKE_DOWN_CHOICES, type TakeDownChoice, canRestoreUpload, formatBytes, stampOf, takeDownReason, uploadKindLabel } from "./adminLogic";
import type { Actor } from "./UsersTab";

const PAGE = 24;
const STATES: readonly { id: UploadState; label: string }[] = [
  { id: "live", label: "Live" },
  { id: "taken_down", label: "Taken down" },
  { id: "all", label: "All" },
];
const KINDS: readonly { id: UploadKind | "both"; label: string }[] = [
  { id: "both", label: "Both" },
  { id: "playmat", label: "Playmat" },
  { id: "cardBack", label: "Card back" },
];

/** An upload, fetched with the staff cookie. Blurred until a moderator asks to see it. */
function UploadImage({ row }: { row: UploadRow }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    let live = true;
    let made: string | null = null;
    fetchUploadImageUrl(row.id)
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
  }, [row.id]);
  return (
    <div className="rpt-image upl-image">
      <div className="rpt-image-frame upl-frame" data-kind={row.kind} data-shown={shown ? "true" : "false"}>
        {url ? <img src={url} alt={shown ? uploadKindLabel(row.kind) : ""} /> : <span className="adm-muted">{failed ? "Could not load the image." : "Loading image…"}</span>}
      </div>
      <button type="button" className="btn btn-secondary btn-sm rpt-reveal" disabled={!url} aria-pressed={shown} onClick={() => setShown((v) => !v)}>
        {shown ? "Hide image" : "Show image"}
      </button>
    </div>
  );
}

/** "Take down": a modal in the shared Dialog (fixed overlay), so the grid behind it does not move. */
function TakeDownDialog({ row, onDone, onClose }: { row: UploadRow; onDone: (next: UploadRow) => void; onClose: () => void }) {
  const [choice, setChoice] = useState<TakeDownChoice>("Copyright notice");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reason = takeDownReason(choice, note);

  async function submit() {
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      onDone(await takeDownUpload(row.id, reason));
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not work.");
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={() => (busy ? undefined : onClose())} className="feedback-backdrop" panelClassName="feedback-card report-card">
      <DialogTitle className="feedback-title">
        Take down {row.owner.name}'s {uploadKindLabel(row.kind).toLowerCase()}
      </DialogTitle>
      <form
        className="upl-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="adm-muted upl-hint">Nobody sees it any more and the owner's active image is cleared. The file is kept as evidence.</p>
        <Select
          label="Reason"
          className="rpt-field"
          value={choice}
          onChange={setChoice}
          disabled={busy}
          options={TAKE_DOWN_CHOICES.map((c) => ({ value: c, label: c }))}
        />
        <label className="rpt-field">
          <span>{choice === "Other" ? "Say why (required)" : "Note (optional, staff only)"}</span>
          <input type="text" value={note} maxLength={150} disabled={busy} onChange={(e) => setNote(e.target.value)} />
        </label>
        <p className="adm-error rpt-error" role="alert">
          {error ?? ""}
        </p>
        <div className="rpt-panel-actions">
          <button type="submit" className="btn btn-primary btn-sm rpt-ban-confirm" disabled={busy || !reason}>
            Confirm take down
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function UploadCard({ row, actor, onTakeDown, onChange }: { row: UploadRow; actor: Actor; onTakeDown: (r: UploadRow) => void; onChange: (next: UploadRow) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const down = row.taken_down_at !== null;

  async function restore() {
    setBusy(true);
    setError(null);
    try {
      onChange(await restoreUpload(row.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rpt-card upl-card" data-down={down ? "true" : "false"} aria-label={`Upload ${row.id} from ${row.owner.name}`}>
      <header className="rpt-head">
        <div className="rpt-who">
          <b className="rpt-name">{row.owner.name}</b>
          {row.owner.role !== "user" ? <span className="adm-pill adm-pill-ok">{row.owner.role}</span> : null}
          {row.owner.banned ? <span className="adm-pill adm-pill-bad">Banned</span> : null}
        </div>
      </header>
      <div className="rpt-badges">
        <span className="adm-pill adm-pill-mid">{uploadKindLabel(row.kind)}</span>
        {row.in_use ? <span className="adm-pill adm-pill-ok">In use</span> : null}
        {row.report_count > 0 ? <span className="adm-pill adm-pill-warn">{row.report_count} {row.report_count === 1 ? "report" : "reports"}</span> : null}
        {down ? <span className="adm-pill adm-pill-bad">Taken down</span> : null}
      </div>
      <UploadImage row={row} />
      <p className="rpt-meta">
        <span>{stampOf(row.created_at)}</span>
        <span>{formatBytes(row.size)}</span>
        <span>#{row.id}</span>
      </p>
      <p className="rpt-handled upl-down">
        {down ? (
          <>
            Taken down{row.taken_down_by_name ? ` by ${row.taken_down_by_name}` : ""} · {stampOf(row.taken_down_at!)}
            {row.taken_down_reason ? <span className="rpt-staffnote"> · {row.taken_down_reason}</span> : null}
          </>
        ) : null}
      </p>
      <div className="rpt-actions">
        {down ? (
          canRestoreUpload(actor, row) ? (
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void restore()}>
              Restore
            </button>
          ) : (
            <span className="adm-note">Only an admin can restore.</span>
          )
        ) : (
          <button type="button" className="btn btn-secondary btn-sm rpt-ban" disabled={busy} onClick={() => onTakeDown(row)}>
            Take down
          </button>
        )}
      </div>
      <p className="adm-error rpt-error" role="alert">
        {error ?? ""}
      </p>
    </article>
  );
}

export function UploadsTab({ actor }: { actor: Actor }) {
  const [state, setState] = useState<UploadState>("live");
  const [kind, setKind] = useState<UploadKind | "both">("both");
  const [data, setData] = useState<{ status: "loading" } | { status: "error"; message: string } | { status: "ready"; total: number; items: UploadRow[] }>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [more, setMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [pending, setPending] = useState<UploadRow | null>(null);
  const seq = useRef(0);

  const load = useCallback((s: UploadState, k: UploadKind | "both") => {
    const mine = ++seq.current;
    setRefreshing(true);
    setMoreError(null);
    fetchAdminUploads(s, k === "both" ? null : k, 0, PAGE)
      .then((r) => mine === seq.current && setData({ status: "ready", total: r.total, items: r.items }))
      .catch((e: Error) => mine === seq.current && setData((d) => (d.status === "ready" ? d : { status: "error", message: e.message })))
      .finally(() => mine === seq.current && setRefreshing(false));
  }, []);

  useEffect(() => load(state, kind), [state, kind, load]);

  const loadMore = () => {
    if (data.status !== "ready") return;
    const mine = seq.current;
    setMore(true);
    setMoreError(null);
    fetchAdminUploads(state, kind === "both" ? null : kind, data.items.length, PAGE)
      .then((r) =>
        mine === seq.current &&
        setData((d) => {
          if (d.status !== "ready") return d;
          const seen = new Set(d.items.map((i) => i.id));
          return { status: "ready", total: r.total, items: [...d.items, ...r.items.filter((i) => !seen.has(i.id))] };
        }),
      )
      .catch((e: Error) => setMoreError(e.message))
      .finally(() => setMore(false));
  };

  // A changed row stays where it is, so the grid does not jump under the cursor; Refresh moves it to the right filter.
  const replace = (next: UploadRow) =>
    setData((d) => (d.status === "ready" ? { ...d, items: d.items.map((x) => (x.id === next.id ? next : x)) } : d));

  const items = data.status === "ready" ? data.items : [];
  return (
    <section className="panel rpt upl" aria-label="Uploads">
      <div className="adm-toolbar">
        <div className="segmented segmented-3 upl-filter" role="radiogroup" aria-label="Show uploads">
          {STATES.map((f) => (
            <button key={f.id} type="button" role="radio" aria-checked={state === f.id} className={state === f.id ? "active" : ""} onClick={() => setState(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="segmented segmented-3 upl-filter" role="radiogroup" aria-label="Kind of upload">
          {KINDS.map((f) => (
            <button key={f.id} type="button" role="radio" aria-checked={kind === f.id} className={kind === f.id ? "active" : ""} onClick={() => setKind(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        <span className="adm-count" aria-live="polite">
          {data.status === "ready" ? `${items.length} of ${data.total} shown` : " "}
        </span>
        <button type="button" className="btn btn-secondary btn-sm adm-refresh" onClick={() => load(state, kind)} disabled={refreshing} aria-busy={refreshing}>
          Refresh
        </button>
      </div>
      {data.status === "loading" ? <p className="panel-copy adm-muted">Loading uploads…</p> : null}
      {data.status === "error" ? (
        <p className="adm-error" role="alert">
          Could not load uploads: {data.message}
        </p>
      ) : null}
      {data.status === "ready" && items.length === 0 ? (
        <p className="panel-copy adm-muted">{state === "taken_down" ? "Nothing has been taken down." : "No uploads match."}</p>
      ) : null}
      <div className="upl-grid">
        {items.map((r) => (
          <UploadCard key={r.id} row={r} actor={actor} onTakeDown={setPending} onChange={replace} />
        ))}
      </div>
      {data.status === "ready" && items.length < data.total ? (
        <div className="upl-more">
          <button type="button" className="btn btn-secondary btn-sm" disabled={more} aria-busy={more} onClick={loadMore}>
            Load more
          </button>
          <span className="adm-error" role="alert">
            {moreError ?? ""}
          </span>
        </div>
      ) : null}
      {pending ? (
        <TakeDownDialog
          row={pending}
          onClose={() => setPending(null)}
          onDone={(next) => {
            replace(next);
            setPending(null);
          }}
        />
      ) : null}
    </section>
  );
}
