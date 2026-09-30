import { useState } from "react";
import {
  MAX_REPORT_LENGTH,
  reportDescriptionError,
  submitCardReport,
} from "../cards/cardReport";

type Phase = "closed" | "editing" | "sending" | "sent";

/** "Report a problem" affordance inside card inspect. */
export function CardReportForm({ cardId }: { cardId: string }) {
  const [phase, setPhase] = useState<Phase>("closed");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (phase === "closed") {
    return (
      <button
        type="button"
        className="btn btn-secondary card-report-open"
        onClick={() => setPhase("editing")}
      >
        Report a problem with this card
      </button>
    );
  }

  if (phase === "sent") {
    return (
      <p className="card-report-sent" role="status">
        Thanks, your report was sent.
      </p>
    );
  }

  async function send() {
    const invalid = reportDescriptionError(description);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setPhase("sending");
    try {
      await submitCardReport(cardId, description);
      setPhase("sent");
      setDescription("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("editing");
    }
  }

  const sending = phase === "sending";
  return (
    <form
      className="card-report"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <label className="card-inspect-effect-label" htmlFor={`card-report-${cardId}`}>
        What's broken?
      </label>
      <textarea
        id={`card-report-${cardId}`}
        className="card-report-text"
        value={description}
        maxLength={MAX_REPORT_LENGTH}
        rows={4}
        autoFocus
        disabled={sending}
        placeholder="What did you do, what happened, and what should have happened?"
        onChange={(e) => {
          setDescription(e.target.value);
          if (error) setError(null);
        }}
      />
      {error ? (
        <p className="card-report-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="card-report-actions">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={sending}
          onClick={() => {
            setPhase("closed");
            setError(null);
          }}
        >
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={sending}>
          {sending ? "Sending…" : "Send report"}
        </button>
      </div>
    </form>
  );
}
