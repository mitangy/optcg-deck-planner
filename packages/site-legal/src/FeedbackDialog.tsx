import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Dialog, DialogTitle } from "@optcg/ui/popups";
import {
  FEEDBACK_KINDS,
  MAX_FEEDBACK_LENGTH,
  buildFeedbackPayload,
  feedbackMessageError,
  type FeedbackKind,
  type FeedbackPayload,
} from "./feedback";

type Props = {
  /** "Report a problem" in a match, "Send feedback" elsewhere. */
  title: string;
  /** The app's own network call; reject with an Error whose message is shown to the person. */
  submit: (payload: FeedbackPayload) => Promise<void>;
  onClose: () => void;
};

type Phase = "editing" | "sending" | "sent";

/**
 * Modal over whatever page is open (fixed overlay: nothing behind it moves).
 * It is the shared Headless UI Dialog (`@optcg/ui/popups`): Escape and the backdrop close it
 * (not while sending), Tab stays inside it, focus lands in the text box and returns to the opener on
 * close, and it renders in a portal so no parent can clip or stack over it.
 */
export function FeedbackDialog({ title, submit, onClose }: Props) {
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [message, setMessage] = useState("");
  const [phase, setPhase] = useState<Phase>("editing");
  const [error, setError] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  // Headless UI skips initial focus on touch screens (it would raise the keyboard); this dialog always did,
  // since writing is the one thing it is for, so the text box takes focus itself as it mounts.
  const focusOnMount = useCallback((el: HTMLTextAreaElement | null) => {
    textRef.current = el;
    el?.focus();
  }, []);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const sending = phase === "sending";

  useEffect(() => {
    if (phase === "sent") closeRef.current?.focus();
  }, [phase]);

  const invalid = feedbackMessageError(message);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (sending) return;
    if (invalid) {
      setError(invalid);
      textRef.current?.focus();
      return;
    }
    setError(null);
    setPhase("sending");
    try {
      await submit(buildFeedbackPayload(kind, message));
      setPhase("sent");
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Could not send feedback. Try again.");
      setPhase("editing");
    }
  };

  return (
    <Dialog open onClose={() => (sending ? undefined : onClose())} className="feedback-backdrop" panelClassName="feedback-card">
      <DialogTitle className="feedback-title">{title}</DialogTitle>
        {phase === "sent" ? (
          <>
            <p className="feedback-thanks" role="status">
              Thanks, we got it.
            </p>
            <div className="feedback-actions">
              <button ref={closeRef} type="button" className="feedback-btn feedback-btn-primary" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={onSubmit} noValidate>
            <div className="feedback-kinds" role="radiogroup" aria-label="Type">
              {FEEDBACK_KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  role="radio"
                  aria-checked={kind === k.id}
                  className="feedback-kind"
                  disabled={sending}
                  onClick={() => setKind(k.id)}
                >
                  {k.label}
                </button>
              ))}
            </div>
            <textarea
              ref={focusOnMount}
              className="feedback-text"
              aria-label="Message"
              placeholder="What happened, and what did you expect?"
              rows={6}
              value={message}
              maxLength={MAX_FEEDBACK_LENGTH + 200}
              readOnly={sending}
              onChange={(e) => {
                setMessage(e.target.value);
                if (error) setError(null);
              }}
            />
            {/* Always rendered so an error never resizes the card. */}
            <p className="feedback-error" role="alert">
              {error ?? ""}
            </p>
            <div className="feedback-actions">
              <button type="button" className="feedback-btn" onClick={onClose} disabled={sending}>
                Cancel
              </button>
              <button type="submit" className="feedback-btn feedback-btn-primary" disabled={sending}>
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </form>
        )}
    </Dialog>
  );
}
