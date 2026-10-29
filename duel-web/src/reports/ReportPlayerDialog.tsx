import { useEffect, useRef, useState, type FormEvent } from "react";
import { Dialog, DialogTitle } from "@optcg/ui/popups";
import {
  IMAGE_KINDS,
  MAX_REPORT_NOTE,
  REPORT_REASONS,
  buildReportRequest,
  draftProblem,
  imageReasonAvailable,
  isDefaultImage,
  type ImageKind,
  type ReportDraft,
  type ReportPlayer,
  type ReportReason,
  type ReportRequest,
  type ReportTarget,
} from "./reportLogic";

type Props = {
  target: ReportTarget;
  /** The app's network call; reject with an Error whose message is shown to the person. */
  submit: (body: ReportRequest) => Promise<void>;
  onClose: () => void;
};

type Phase = "editing" | "sending" | "sent";

/**
 * "Report {name}": a modal in the shared Dialog (fixed overlay in a portal, so nothing behind it moves).
 * The error line and the buttons keep their size while sending, so nothing shifts under the thumb.
 */
export function ReportPlayerDialog({ target, submit, onClose }: Props) {
  const only = target.players.length === 1 ? target.players[0]! : null;
  const [player, setPlayer] = useState<ReportPlayer | null>(only);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [imageKind, setImageKind] = useState<ImageKind | null>(null);
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState<Phase>("editing");
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const sending = phase === "sending";

  useEffect(() => {
    if (phase === "sent") closeRef.current?.focus();
  }, [phase]);

  const draft: ReportDraft = { reason, imageKind, note, player };
  const problem = draftProblem(draft);
  const name = player?.name ?? "";

  const pickReason = (r: ReportReason) => {
    setReason(r);
    if (r !== "image") setImageKind(null);
    setError(null);
  };
  const pickPlayer = (p: ReportPlayer) => {
    setPlayer(p);
    // A different player has different art: start the image choice again.
    setImageKind(null);
    if (reason === "image" && !imageReasonAvailable(p)) setReason(null);
    setError(null);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (sending || problem) return;
    setError(null);
    setPhase("sending");
    try {
      await submit(buildReportRequest(target, draft));
      setPhase("sent");
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Could not send the report. Try again.");
      setPhase("editing");
    }
  };

  return (
    <Dialog open onClose={() => (sending ? undefined : onClose())} className="feedback-backdrop" panelClassName="feedback-card report-card">
      <DialogTitle className="feedback-title">{only ? `Report ${only.name}` : player ? `Report ${name}` : "Report a player"}</DialogTitle>
      {phase === "sent" ? (
        <>
          <p className="feedback-thanks" role="status">
            Thanks. A moderator will review it. {name} won&apos;t be told who reported them.
          </p>
          <div className="feedback-actions">
            <button ref={closeRef} type="button" className="feedback-btn feedback-btn-primary" onClick={onClose}>
              Close
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          {!only ? (
            <div className="report-group" role="radiogroup" aria-label="Who are you reporting?">
              <p className="report-label">Who are you reporting?</p>
              <div className="report-players">
                {target.players.map((p) => (
                  <button
                    key={`${p.seat ?? ""}${p.name}`}
                    type="button"
                    role="radio"
                    aria-checked={player === p}
                    className="feedback-kind report-player"
                    disabled={sending}
                    onClick={() => pickPlayer(p)}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="report-group" role="radiogroup" aria-label="Reason">
            <p className="report-label">Why are you reporting?</p>
            <div className="report-reasons">
            {REPORT_REASONS.map((r) => {
              const off = r.id === "image" && !imageReasonAvailable(player);
              return (
                <button
                  key={r.id}
                  type="button"
                  role="radio"
                  aria-checked={reason === r.id}
                  className="report-reason"
                  disabled={sending || off}
                  title={off ? "Their playmat and card back are the defaults." : undefined}
                  onClick={() => pickReason(r.id)}
                >
                  <span className="report-radio" aria-hidden />
                  <span className="report-reason-text">
                    {r.label}
                    {off ? <small>Their playmat and card back are the defaults.</small> : null}
                  </span>
                </button>
              );
            })}
            </div>
          </div>

          {reason === "image" && player ? (
            <div className="report-group" role="radiogroup" aria-label="Which image">
              <p className="report-label">Which image?</p>
              <div className="report-images">
                {IMAGE_KINDS.map((k) => {
                  const src = player.images?.[k.id] ?? null;
                  const isDefault = isDefaultImage(player, k.id);
                  return (
                    <button
                      key={k.id}
                      type="button"
                      role="radio"
                      aria-checked={imageKind === k.id}
                      className="report-image"
                      disabled={sending || isDefault}
                      onClick={() => setImageKind(k.id)}
                    >
                      <span className={`report-thumb report-thumb-${k.id}`} aria-hidden>
                        {src ? <img src={src} alt="" /> : null}
                      </span>
                      <span className="report-image-text">
                        {k.label}
                        {isDefault ? <small>Default</small> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <label className="report-note-label" htmlFor="report-note">
            Details <span className="report-optional">(optional)</span>
          </label>
          <textarea
            id="report-note"
            className="feedback-text report-note"
            rows={3}
            placeholder="Anything a moderator should know?"
            value={note}
            maxLength={MAX_REPORT_NOTE}
            readOnly={sending}
            onChange={(e) => {
              setNote(e.target.value);
              if (error) setError(null);
            }}
          />
          <p className="report-count" aria-hidden>
            {note.length}/{MAX_REPORT_NOTE}
          </p>
          <p className="report-rules">
            Reports follow our{" "}
            <a href="/conduct" target="_blank" rel="noopener noreferrer">
              Rules of conduct
            </a>
            .
          </p>
          {/* Always rendered so an error never resizes the card. */}
          <p className="feedback-error" role="alert">
            {error ?? ""}
          </p>
          <div className="feedback-actions">
            <button type="button" className="feedback-btn" onClick={onClose} disabled={sending}>
              Cancel
            </button>
            <button type="submit" className="feedback-btn feedback-btn-primary" disabled={sending || problem !== null}>
              {sending ? "Sending…" : "Send report"}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
