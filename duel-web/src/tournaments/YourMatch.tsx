import { Select } from "@optcg/ui/popups";
import { opponentOf, pendingFeederPlayers, playLabel, roundLabel, yourMatchState } from "./bracket";
import type { Tournament, TournamentMatch } from "./tournamentApi";

export function YourMatch({
  t,
  next,
  myId,
  busy,
  deck,
  onPlay,
}: {
  t: Tournament;
  next: TournamentMatch | null;
  myId: number;
  busy: boolean;
  deck: { options: { value: string; label: string }[]; id: string; pick: (v: string) => void };
  onPlay: (m: TournamentMatch) => void;
}) {
  const state = next && next.status === "ready" ? yourMatchState(next, myId) : "ready";
  const opp = next ? (opponentOf(next, myId)?.username ?? "TBD") : "";
  const feeders = next && next.status === "waiting" && t.format === "single_elim" ? pendingFeederPlayers(t.matches, next, myId) : null;
  const where = next ? (t.format === "single_elim" ? roundLabel(next.round, t.rounds) : `Round ${next.round}`) : "";
  return (
    <section className="panel tmine" aria-label="Your match" data-state={next?.status === "ready" ? state : undefined}>
      <h2 className="panel-title">Your match</h2>
      {next ? (
        <>
          <p className="panel-copy">
            {next.status !== "ready" ? (
              feeders ? (
                <>
                  <strong>
                    You play the winner of {feeders[0].username} vs {feeders[1].username}
                  </strong>
                  {` · ${where}`}
                </>
              ) : (
                "Waiting for your opponent to be decided."
              )
            ) : state === "opponent-waiting" ? (
              <>
                <strong>{opp} is waiting in the room</strong>
                {` · ${where}`}
              </>
            ) : state === "you-hosting" ? (
              <>
                <strong>Waiting for {opp} to join</strong>
                {` · ${where}`}
              </>
            ) : (
              <>
                <strong>You vs {opp}</strong>
                {` · ${where}`}
              </>
            )}
          </p>
          {next.status === "ready" ? (
            <div className="tmine-row">
              <div className="field">
                <label htmlFor="t-deck">Your deck</label>
                <Select<string> id="t-deck" value={deck.id} onChange={deck.pick} options={deck.options} />
              </div>
              <button type="button" className="btn btn-primary" disabled={busy || !deck.id} onClick={() => onPlay(next)}>
                {playLabel(state)}
              </button>
            </div>
          ) : null}
          {next.status === "ready" && state === "ready" ? (
            <p className="field-hint">Both of you press Play. One opens the room and the other joins it. Pick your deck first.</p>
          ) : null}
        </>
      ) : (
        <p className="panel-copy">{t.players.some((p) => p.user_id === myId && p.status === "joined") ? "You have no match right now." : "You are not in this tournament."}</p>
      )}
    </section>
  );
}
