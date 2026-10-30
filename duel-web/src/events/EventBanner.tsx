import { useCallback, useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { Dialog, DialogTitle } from "@optcg/ui/popups";
import { googleLoginUrl } from "../net/api";
import { type DuelEvent, fetchCurrentEvent, joinEvent } from "./eventApi";
import { bannerCta, closedNote, eventPhase, formatWindow, progressLabel, staffNote, statusLine } from "./eventLogic";

/** The current time. Re-armed after every tick: every 15 seconds, every second in the last two minutes before a change, and not at all once the event has ended. */
function useNow(event: DuelEvent | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!event) return;
    const current = Date.now();
    const next = [Date.parse(event.starts_at), Date.parse(event.ends_at)].find((t) => t > current);
    if (next === undefined) return;
    const timer = window.setTimeout(() => setNow(Date.now()), next - current < 120_000 ? 1000 : 15_000);
    return () => window.clearTimeout(timer);
  }, [event, now]);
  return now;
}

function useCurrentEvent() {
  const [event, setEvent] = useState<DuelEvent | null>(null);
  const load = useCallback(() => {
    fetchCurrentEvent()
      .then(setEvent)
      .catch(() => undefined); // the banner is optional: no event, no banner
  }, []);
  useEffect(() => {
    load();
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);
  return { event, reload: load };
}

export function rulesPath(eventId: string): string {
  return `/events/${encodeURIComponent(eventId)}/rules`;
}

function JoinDialog({ event, open, onClose, onJoined }: { event: DuelEvent; open: boolean; onClose: () => void; onJoined: () => void }) {
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxId = useId();

  useEffect(() => {
    if (open) {
      setAgreed(false);
      setError(null);
    }
  }, [open]);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await joinEvent(event.id, event.rules_version);
      onJoined();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not join. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} className="event-overlay" panelClassName="event-dialog">
      <DialogTitle as="h2">Join the {event.title} giveaway</DialogTitle>
      <p className="event-dialog-copy">
        It is free: just play. {event.prize}, sent by email. Play {event.min_games} finished games against at least {event.min_opponents} different signed-in
        players during the event to be entered.
      </p>
      {event.viewer === "staff" ? <p className="event-dialog-copy event-staff-note">You can play, but staff aren't eligible for prizes.</p> : null}
      <label className="event-check" htmlFor={boxId}>
        <input id={boxId} type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>
          I'm a US resident aged 13 or older, and if I'm under 18 I have a parent's or guardian's permission. I've read the{" "}
          <Link to={rulesPath(event.id)} target="_blank" rel="noopener">
            official rules
          </Link>
          .
        </span>
      </label>
      <p className="event-dialog-error" role="alert">
        {error}
      </p>
      <div className="event-dialog-actions">
        <button type="button" className="btn btn-primary" disabled={!agreed || busy} aria-busy={busy} onClick={confirm}>
          Join the giveaway
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>
          Cancel
        </button>
      </div>
    </Dialog>
  );
}

/** Home-page banner for the current giveaway event. Renders nothing when there is none. */
export function EventBanner() {
  const { event, reload } = useCurrentEvent();
  const now = useNow(event);
  const [joining, setJoining] = useState(false);
  if (!event) return null;

  const phase = eventPhase(event, now);
  const cta = bannerCta(event, now);
  const progress = event.progress;
  const staff = staffNote(event, now);

  return (
    <section className="event-banner" data-phase={phase} aria-label={event.title}>
      <div className="event-head">
        <h2 className="event-title">{event.title}</h2>
        <span className="event-status" role="timer" aria-live="off">
          {statusLine(event, now)}
        </span>
      </div>
      <p className="event-when">{formatWindow(event.starts_at, event.ends_at)}</p>
      <p className="event-prize">Free giveaway · {event.prize}</p>
      <div className="event-action">
        {cta === "join" ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setJoining(true)}>
            Join the giveaway
          </button>
        ) : cta === "signin" ? (
          <a className="btn btn-primary btn-sm" href={googleLoginUrl()}>
            Sign in to join
          </a>
        ) : cta === "joined" ? (
          <span className="event-progress" data-eligible={progress?.eligible ? "true" : "false"}>
            <b>{progress?.eligible ? "✓ Eligible" : "Entered"}</b>
            {progress ? <span>{progressLabel(progress, event)}</span> : null}
          </span>
        ) : (
          <span className="event-progress event-muted">{closedNote(event, now)}</span>
        )}
        <Link to={rulesPath(event.id)} className="event-rules-link">
          Official rules
        </Link>
      </div>
      {staff ? <p className="event-staff-note">{staff}</p> : null}
      {cta === "join" ? <JoinDialog event={event} open={joining} onClose={() => setJoining(false)} onJoined={reload} /> : null}
    </section>
  );
}
