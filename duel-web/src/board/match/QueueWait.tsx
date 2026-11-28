import { useEffect, useState } from "react";
import { fetchCurrentEvent, type DuelEvent } from "../../events/eventApi";
import { nextGameNightLine } from "../../events/eventLogic";
import { botOfferDue, formatElapsed } from "./queueWait";

export type QueueWaitInfo = {
  casual: boolean;
  /** When the search began, so a remount of the board keeps counting instead of starting over. */
  startedAt: number;
  /** Leaves the queue and starts a Hard bot game with the chosen deck. Only a casual search has one. */
  playBot?: () => void;
};

function useElapsedSeconds(startedAt: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

function useNextEvent(): DuelEvent | null {
  const [event, setEvent] = useState<DuelEvent | null>(null);
  useEffect(() => {
    let live = true;
    fetchCurrentEvent()
      .then((e) => live && setEvent(e))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return event;
}

/** Sits over the mat (like the room invite). The two late-arriving blocks have reserved room, so Cancel never moves. */
export function QueueWait({ info, onCancel }: { info: QueueWaitInfo; onCancel: () => void }) {
  const elapsed = useElapsedSeconds(info.startedAt);
  const event = useNextEvent();
  const gameNight = nextGameNightLine(event, Date.now());
  const offer = info.casual && info.playBot !== undefined && botOfferDue(elapsed);
  return (
    <div className="queue-wait" role="group" aria-label="Finding an opponent">
      <p className="room-invite-kicker">{info.casual ? "Play now" : "Ranked"}</p>
      <p className="queue-wait-time" role="timer" aria-label={`Searching for ${formatElapsed(elapsed)}`}>
        <span aria-hidden>{formatElapsed(elapsed)}</span>
      </p>
      <p className="room-invite-hint queue-wait-hint">
        {info.casual
          ? "We start as soon as another player is looking for a game."
          : "Ranked games give each player 15 minutes on a chess clock."}
      </p>
      <p className="queue-wait-event">{gameNight}</p>
      <div className="queue-wait-bot">
        {offer ? (
          <>
            <button type="button" className="btn btn-primary" onClick={info.playBot}>
              Play a Hard bot instead
            </button>
            <p className="queue-wait-bot-note">Leaves the queue and starts a casual game against the computer.</p>
          </>
        ) : null}
      </div>
      <button type="button" className="btn btn-secondary queue-wait-cancel" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
