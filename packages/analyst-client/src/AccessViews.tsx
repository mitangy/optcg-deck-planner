import { useCallback, useEffect, useState, type FormEvent } from "react";
import { decideAccess, listAccessRequests, NOTE_MAX, requestAccess, sortRequests, type AccessRequest } from "./access";
import type { AccessState } from "./session";

/** What the panel shows a signed-in player who doesn't have Log Pose yet: the request form, or where their request stands. */
export function RequestAccessView({ apiBase, access, onSent }: { apiBase: string; access: AccessState; onSent: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await requestAccess(apiBase, note);
      setSent(true);
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  if (sent || access === "pending") {
    return (
      <div className="lp-access" data-state="pending">
        <p className="lp-access-lead" role="status">
          Request sent. You&rsquo;ll get Log Pose here once it&rsquo;s approved.
        </p>
      </div>
    );
  }

  return (
    <form className="lp-access" data-state={access} onSubmit={submit}>
      {access === "denied" ? (
        <p className="lp-access-lead" role="status">
          Your request wasn&rsquo;t approved this time.
        </p>
      ) : (
        <h3 className="lp-access-heading">Request access to Log Pose</h3>
      )}
      <p className="lp-access-text">
        Log Pose is a Claude deck and match coach. It&rsquo;s invite-only for now.
        {access === "denied" ? " You can ask again if you like." : ""}
      </p>
      <label className="lp-access-label" htmlFor="lp-access-note">
        What would you use it for? <span className="lp-access-opt">(optional)</span>
      </label>
      <textarea
        id="lp-access-note"
        className="lp-input lp-access-note"
        rows={4}
        maxLength={NOTE_MAX}
        value={note}
        disabled={busy}
        onChange={(e) => setNote(e.target.value)}
      />
      <p className="lp-access-count" aria-hidden="true">
        {note.length}/{NOTE_MAX}
      </p>
      <button type="submit" className="lp-btn lp-btn-send lp-access-send" disabled={busy} aria-busy={busy}>
        Request access
      </button>
      {error ? (
        <p className="lp-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

const STATUS_LABEL = { pending: "Pending", approved: "Approved", denied: "Denied" } as const;

function whenText(iso: string | null): string {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
}

/** Owners: everyone who asked for Log Pose, with Approve / Deny / Revoke. */
export function RequestsList({ apiBase, onChanged }: { apiBase: string; onChanged: () => void }) {
  const [rows, setRows] = useState<AccessRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<number | null>(null);

  const load = useCallback(() => {
    setError(null);
    listAccessRequests(apiBase).then(setRows, (e: unknown) => setError(e instanceof Error ? e.message : "Could not load requests."));
  }, [apiBase]);
  useEffect(load, [load]);

  const decide = async (row: AccessRequest, status: "approved" | "denied") => {
    if (acting !== null) return;
    setActing(row.userId);
    setError(null);
    try {
      const updated = await decideAccess(apiBase, row.userId, status);
      setRows((cur) => sortRequests((cur ?? []).map((r) => (r.userId === updated.userId ? updated : r))));
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that.");
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="lp-reqs">
      {error ? (
        <p className="lp-error" role="alert">
          {error}
        </p>
      ) : null}
      {rows === null && !error ? <p className="lp-note">Loading requests…</p> : null}
      {rows && rows.length === 0 ? <p className="lp-note">No requests yet.</p> : null}
      {rows?.map((r) => (
        <div key={r.userId} className="lp-req" data-status={r.status}>
          <div className="lp-req-main">
            <p className="lp-req-name">{r.name}</p>
            <p className="lp-req-meta">
              <span className="lp-badge lp-req-status" data-status={r.status}>
                {STATUS_LABEL[r.status]}
              </span>
              <span className="lp-req-date">{whenText(r.createdAt)}</span>
            </p>
            {r.note ? <p className="lp-req-note">{r.note}</p> : null}
          </div>
          <div className="lp-req-actions">
            {r.status !== "approved" ? (
              <button type="button" className="lp-btn lp-btn-send lp-req-btn" disabled={acting !== null} onClick={() => void decide(r, "approved")}>
                Approve
              </button>
            ) : null}
            {r.status === "pending" ? (
              <button type="button" className="lp-btn lp-req-btn" disabled={acting !== null} onClick={() => void decide(r, "denied")}>
                Deny
              </button>
            ) : null}
            {r.status === "approved" ? (
              <button type="button" className="lp-btn lp-req-btn" disabled={acting !== null} onClick={() => void decide(r, "denied")}>
                Revoke
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
