import { useEffect, useState } from "react";
import { creditLeft, limitText, lowCreditText, meterFill, meterText, requestTopup, type Credit } from "./credit";
import type { OwnClaude } from "./types";

/** The thin credit bar under the header: "$3.40 of $5.00 left this month". Its height is fixed so loading it moves nothing. */
export function CreditMeter({ credit }: { credit: Credit | null }) {
  const text = credit ? meterText(credit) : null;
  if (credit && credit.creditUsd === null) return null;
  const left = credit ? creditLeft(credit) : null;
  return (
    <div className="lp-credit" data-low={credit && lowCreditText(credit) ? "true" : undefined} data-empty={credit && left === 0 ? "true" : undefined}>
      <p className="lp-credit-text">{text ?? "\u00a0"}</p>
      <span
        className="lp-credit-bar"
        role="progressbar"
        aria-label="Credit left this month"
        aria-valuemin={0}
        aria-valuemax={credit?.creditUsd ?? 0}
        aria-valuenow={left ?? 0}
      >
        <span style={{ width: `${credit ? Math.round(meterFill(credit) * 100) : 0}%` }} />
      </span>
    </div>
  );
}

/** Replaces the input when a limit stops the player: out of credit (with ways forward), today's cap, or the monthly cap. */
export function LimitCard({ apiBase, credit, ownClaude, onAsked }: { apiBase: string; credit: Credit; ownClaude?: OwnClaude; onAsked: () => void }) {
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState(credit.topupRequested);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setAsked(credit.topupRequested), [credit.topupRequested]);
  const ask = async () => {
    if (busy || asked) return;
    setBusy(true);
    setError(null);
    try {
      await requestTopup(apiBase);
      setAsked(true);
      onAsked();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send that.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="lp-limit" data-kind={credit.refusal ?? undefined} role="status">
      <p className="lp-limit-text">{limitText(credit)}</p>
      {credit.refusal === "credit" ? (
        <>
          <div className="lp-limit-actions">
            {ownClaude?.href ? (
              <a className="lp-btn lp-btn-send lp-limit-btn" href={ownClaude.href} target="_blank" rel="noreferrer noopener">
                Use Log Pose in your own Claude
              </a>
            ) : ownClaude?.onSelect ? (
              <button type="button" className="lp-btn lp-btn-send lp-limit-btn" onClick={ownClaude.onSelect}>
                Use Log Pose in your own Claude
              </button>
            ) : null}
            <button type="button" className="lp-btn lp-limit-btn" disabled={busy || asked} aria-busy={busy} onClick={() => void ask()}>
              {asked ? "Request sent" : "Ask for more"}
            </button>
          </div>
          {asked ? <p className="lp-note">Owners can see your request and may add more credit.</p> : null}
          {error ? (
            <p className="lp-error" role="alert">
              {error}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** One line under the input: chats are kept, and the player can delete this one. The confirmation takes the line's place so nothing moves. */
export function ChatNotice({ threadId, busy, onDelete }: { threadId: number | null; busy: boolean; onDelete: (id: number) => Promise<void> }) {
  const [asking, setAsking] = useState(false);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setAsking(false);
    setFailed(false);
  }, [threadId]);
  const confirm = async () => {
    if (threadId === null || working) return;
    setWorking(true);
    setFailed(false);
    try {
      await onDelete(threadId);
      setAsking(false);
    } catch {
      setFailed(true);
    } finally {
      setWorking(false);
    }
  };
  return (
    <p className="lp-saved">
      {asking ? (
        <>
          <span className="lp-saved-text">{failed ? "Couldn\u2019t delete. Try again?" : "Delete this chat for good?"}</span>
          <button type="button" className="lp-saved-btn lp-saved-danger" disabled={working} onClick={() => void confirm()}>
            Delete
          </button>
          <button type="button" className="lp-saved-btn" disabled={working} onClick={() => setAsking(false)}>
            Keep
          </button>
        </>
      ) : (
        <>
          <span className="lp-saved-text">Chats are saved to improve Log Pose.</span>
          {threadId !== null ? (
            <button type="button" className="lp-saved-btn" disabled={busy} onClick={() => setAsking(true)}>
              Delete this chat
            </button>
          ) : null}
        </>
      )}
    </p>
  );
}
