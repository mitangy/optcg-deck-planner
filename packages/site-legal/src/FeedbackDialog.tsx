import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
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

const FOCUSABLE = 'button:not([disabled]), textarea, input, [href], [tabindex]:not([tabindex="-1"])';

/**
 * Modal over whatever page is open (fixed overlay: nothing behind it moves).
 * Escape and the backdrop close it, focus lands in the text box and returns to
 * the opener on close. Rendered in a portal so no parent can clip or stack over it.
 */
export function FeedbackDialog({ title, submit, onClose }: Props) {
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [message, setMessage] = useState("");
  const [phase, setPhase] = useState<Phase>("editing");
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const sending = phase === "sending";
  const sendingRef = useRef(false);
  sendingRef.current = sending;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    textRef.current?.focus();
    // Capture phase: Escape closes this dialog only, not a menu or sheet under it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (!sendingRef.current) onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !cardRef.current) return;
      const items = Array.from(cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!cardRef.current.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (opener && opener.isConnected) opener.focus();
    };
  }, []);

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

  return createPortal(
    <div
      className="feedback-backdrop"
      role="presentation"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && !sending) onClose();
      }}
    >
      <div ref={cardRef} className="feedback-card" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId} className="feedback-title">
          {title}
        </h2>
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
              ref={textRef}
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
      </div>
    </div>,
    document.body,
  );
}
