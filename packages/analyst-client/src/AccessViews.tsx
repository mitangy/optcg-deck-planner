import { useCallback, useEffect, useState, type FormEvent } from "react";
import { answerTopup, decideAccess, listAccessRequests, NOTE_MAX, requestAccess, setFreeSpots, sortRequests, type AccessRequest } from "./access";
import { formatUsd } from "./credit";
import type { AccessState } from "./session";

/** What the panel shows a signed-in player who doesn't have Log Pose yet: the request form, or where their request stands. */
export function RequestAccessView({
  apiBase,
  access,
  onSent,
  freeSpots,
  spotsLeft,
  freeCreditUsd,
}: {
  apiBase: string;
  access: AccessState;
  onSent: () => void;
  /** Free spots in all and how many are left; unknown when the API doesn't say. */
  freeSpots?: number;
  spotsLeft?: number;
  /** The monthly credit a free spot brings. */
  freeCreditUsd?: number;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<"pending" | "approved" | null>(null);
  const full = spotsLeft !== undefined && spotsLeft <= 0;
  const credit = formatUsd(freeCreditUsd ?? 5);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setSent(await requestAccess(apiBase, note));
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  if (sent === "approved") {
    return (
      <div className="lp-access" data-state="approved">
        <p className="lp-access-lead" role="status">
          You&rsquo;re in. Your free {credit} of Log Pose is ready.
        </p>
      </div>
    );
  }
  if (sent === "pending" || access === "pending") {
    return (
      <div className="lp-access" data-state="pending">
        <p className="lp-access-lead" role="status">
          You&rsquo;re on the waitlist.
        </p>
        <p className="lp-access-text">We&rsquo;ll let you know. Log Pose turns on here once you&rsquo;re approved.</p>
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
        <h3 className="lp-access-heading">{full ? "Join the Log Pose waitlist" : "Claim your free Log Pose credit"}</h3>
      )}
      <p className="lp-access-text">
        {full
          ? `All ${freeSpots ?? 50} free spots are taken. Join the waitlist and we'll let you know.`
          : `Log Pose is a Claude deck and match coach. Claim ${credit} of free credit every month.`}
        {access === "denied" ? " You can ask again if you like." : ""}
      </p>
      {!full && spotsLeft !== undefined && freeSpots ? (
        <p className="lp-access-spots" data-testid="lp-spots-left">
          {spotsLeft} of {freeSpots} free spots left
        </p>
      ) : null}
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
        {full ? "Join the waitlist" : "Claim free credit"}
      </button>
      {error ? (
        <p className="lp-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

const STATUS_LABEL = { pending: "Waitlist", approved: "Approved", denied: "Denied" } as const;

function whenText(iso: string | null): string {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
}

/** Owners: everyone who asked for Log Pose, with Approve / Deny / Revoke. */
export function RequestsList({ apiBase, onChanged }: { apiBase: string; onChanged: () => void }) {
  const [rows, setRows] = useState<AccessRequest[] | null>(null);
  const [spots, setSpots] = useState<{ free: number; used: number } | null>(null);
  const [spotsDraft, setSpotsDraft] = useState("");
  const [savingSpots, setSavingSpots] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<number | null>(null);

  const load = useCallback(() => {
    setError(null);
    listAccessRequests(apiBase).then(
      (list) => {
        setRows(sortRequests(list.requests));
        setSpots({ free: list.freeSpots, used: list.spotsUsed });
        setSpotsDraft(String(list.freeSpots));
      },
      (e: unknown) => setError(e instanceof Error ? e.message : "Could not load requests."),
    );
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

  const topup = async (row: AccessRequest, action: "add" | "dismiss") => {
    if (acting !== null) return;
    setActing(row.userId);
    setError(null);
    try {
      const updated = await answerTopup(apiBase, row.userId, action);
      setRows((cur) => sortRequests((cur ?? []).map((r) => (r.userId === updated.userId ? updated : r))));
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that.");
    } finally {
      setActing(null);
    }
  };

  const spotsValue = /^\d{1,5}$/.test(spotsDraft.trim()) ? Number(spotsDraft.trim()) : null;
  const saveSpots = async (e: FormEvent) => {
    e.preventDefault();
    if (savingSpots || spotsValue === null || spotsValue === spots?.free) return;
    setSavingSpots(true);
    setError(null);
    try {
      const saved = await setFreeSpots(apiBase, spotsValue);
      setSpots({ free: saved.freeSpots, used: saved.spotsUsed });
      setSpotsDraft(String(saved.freeSpots));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that.");
    } finally {
      setSavingSpots(false);
    }
  };

  return (
    <div className="lp-reqs">
      {spots ? (
        <form className="lp-spots" onSubmit={(e) => void saveSpots(e)}>
          <label className="lp-spots-label" htmlFor="lp-spots-input">
            Free spots
          </label>
          <input
            id="lp-spots-input"
            className="lp-input lp-spots-input"
            inputMode="numeric"
            value={spotsDraft}
            maxLength={5}
            disabled={savingSpots}
            onChange={(e) => setSpotsDraft(e.target.value)}
          />
          <button type="submit" className="lp-btn lp-spots-save" disabled={savingSpots || spotsValue === null || spotsValue === spots.free}>
            Save
          </button>
          <p className="lp-spots-note">
            {spots.used} of {spots.free} taken
          </p>
        </form>
      ) : null}
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
              {r.autoApproved ? <span className="lp-badge">Free spot</span> : null}
              <span className="lp-req-date">{whenText(r.createdAt)}</span>
            </p>
            {r.status === "approved" && r.creditUsd !== null ? (
              <p className="lp-req-credit">
                {formatUsd(r.creditSpentUsd)} of {formatUsd(r.creditUsd)} used this month
              </p>
            ) : null}
            {r.topupRequestedAt ? <p className="lp-req-topup">Asked for more credit</p> : null}
            {r.note ? <p className="lp-req-note">{r.note}</p> : null}
          </div>
          <div className="lp-req-actions">
            {r.topupRequestedAt ? (
              <>
                <button type="button" className="lp-btn lp-btn-send lp-req-btn" disabled={acting !== null} onClick={() => void topup(r, "add")}>
                  Add $5
                </button>
                <button type="button" className="lp-btn lp-req-btn" disabled={acting !== null} onClick={() => void topup(r, "dismiss")}>
                  Dismiss
                </button>
              </>
            ) : null}
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
            {r.status === "approved" && !r.topupRequestedAt ? (
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
