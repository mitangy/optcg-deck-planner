import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, googleLoginUrl } from "../net/api";
import { PageShell } from "../layout/PageShell";
import { ensureDefaultDeck, getSelectedDeckId, listSavedDecks, setSelectedDeckId } from "../decks/storage";
import { useFriends } from "../friends/FriendsPanel";
import {
  formatLabel,
  groupByRound,
  invitableFriends,
  joinedCount,
  minPlayers,
  myNextMatch,
  opponentOf,
  roundStartsOpen,
  startBlocker,
} from "./bracket";
import { Bracket } from "./Bracket";
import { MatchCard } from "./MatchCard";
import { YourMatch } from "./YourMatch";
import { TIMER_PRESET_OPTIONS } from "../home/timerPreset";
import { usePolling } from "../lib/usePolling";
import { useWho } from "./hooks";
import {
  awardTournamentMatch,
  cancelTournament,
  fetchTournament,
  inviteToTournament,
  joinTournament,
  leaveTournament,
  removeTournamentPlayer,
  startTournament,
  type Tournament,
  type TournamentMatch,
} from "./tournamentApi";
import "./tournaments.css";

const POLL_MS = 5_000;

function useDeckPick() {
  const [decks] = useState(() => {
    ensureDefaultDeck();
    return listSavedDecks();
  });
  const [id, setId] = useState(() => {
    const saved = getSelectedDeckId();
    return decks.find((d) => d.id === saved)?.id ?? decks[0]?.id ?? "";
  });
  const pick = (next: string) => {
    setId(next);
    setSelectedDeckId(next);
  };
  return { options: decks.map((d) => ({ value: d.id, label: d.name })), id, pick };
}

export function TournamentPage() {
  const { code = "" } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const who = useWho();
  const [t, setT] = useState<Tournament | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inviteQuery, setInviteQuery] = useState("");
  const deck = useDeckPick();

  const load = useCallback(async () => {
    try {
      setT(await fetchTournament(code));
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof ApiError && e.status === 404 ? "Tournament not found." : e instanceof Error ? e.message : "Could not load the tournament");
    }
  }, [code]);
  usePolling(load, POLL_MS, who.status === "ready");

  const isOrganizer = t?.me.role === "organizer";
  const friends = useFriends(who.status === "ready" && isOrganizer && t?.status === "open");

  async function act(fn: () => Promise<Tournament>) {
    setBusy(true);
    setNote(null);
    try {
      setT(await fn());
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function play(m: TournamentMatch) {
    if (!t) return;
    const opp = opponentOf(m, t.me.user_id);
    navigate("/", { state: { tournamentPlay: { code: t.code, matchId: m.id, opponent: opp?.username ?? "your opponent", timer: t.timer } } });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/tournaments/${code}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setNote("Could not copy. Select the link and copy it.");
    }
  }

  const next = useMemo(() => (t ? myNextMatch(t, t.me.user_id) : null), [t]);
  const rounds = useMemo(() => (t ? groupByRound(t.matches) : []), [t]);
  const myId = t?.me.user_id ?? 0;

  const shellProps = { pageClass: "tpage", back: { to: "/tournaments", label: "Tournaments", ariaLabel: "Back to tournaments" }, title: t?.name ?? "Tournament" };

  if (who.status !== "ready") {
    return (
      <PageShell {...shellProps}>
        {who.status === "loading" ? <p className="panel-copy tnote">Loading…</p> : null}
        {who.status === "signed-out" ? (
          <section className="panel">
            <p className="panel-copy">Sign in to see and join this tournament.</p>
            <div className="btn-row">
              <a className="btn btn-primary" href={googleLoginUrl()}>
                Sign in with Google
              </a>
            </div>
          </section>
        ) : null}
        {who.status === "no-username" ? (
          <section className="panel">
            <p className="panel-copy">Pick a username first.</p>
            <div className="btn-row">
              <Link className="btn btn-primary" to="/welcome/username">
                Pick a username
              </Link>
            </div>
          </section>
        ) : null}
      </PageShell>
    );
  }

  if (!t) {
    return (
      <PageShell {...shellProps}>
        <p className={loadError ? "error-text" : "panel-copy tnote"}>{loadError ?? "Loading…"}</p>
      </PageShell>
    );
  }

  const joined = joinedCount(t.players);
  const blocker = startBlocker(t);
  const open = t.status === "open";
  const started = t.status === "running" || t.status === "finished";
  const sharedFirst = t.status === "finished" && !t.winner && t.standings.filter((r) => r.rank === 1).length > 1;
  const allInvitable = invitableFriends(friends.state?.friends ?? [], t.players);
  const invitable = invitableFriends(friends.state?.friends ?? [], t.players, inviteQuery);

  return (
    <PageShell {...shellProps}>
      <div className="tmeta">
        <span>{formatLabel(t)}</span>
        <span className="tchip" data-status={t.status}>
          {t.status === "open" ? "Signing up" : t.status === "running" ? "Running" : t.status === "finished" ? "Finished" : "Cancelled"}
        </span>
        <span>{TIMER_PRESET_OPTIONS.find((o) => o.value === t.timer)?.label ?? "No timer"}</span>
        <span>by {t.organizer.user_id === myId ? "you" : t.organizer.username}</span>
      </div>

      {note ? <p className="error-text">{note}</p> : null}
      {loadError ? <p className="error-text">{loadError}</p> : null}

      {t.status === "finished" ? (
        <section className="notice notice-gold" aria-label="Winner">
          <div className="notice-body">
            <strong>{t.winner ? (t.winner.user_id === myId ? "You won" : `${t.winner.username} won`) : sharedFirst ? "Shared first place" : "Finished"}</strong>
            <span>{t.name}</span>
          </div>
        </section>
      ) : null}
      {t.status === "cancelled" ? <p className="panel-copy tnote">The organizer cancelled this tournament.</p> : null}

      {open ? (
        <div className="tgrid">
          <section className="panel" aria-label="Players">
            <h2 className="panel-title">
              Players · {joined}/{t.size}
            </h2>
            <ul className="tplayers">
              {t.players.map((p) => (
                <li key={p.user_id} className="tplayer">
                  <span className="tplayer-name">{p.username}</span>
                  <span className="tplayer-status">{p.user_id === t.organizer.user_id ? "Organizer" : p.status === "invited" ? "Invited" : "Joined"}</span>
                  {isOrganizer && p.user_id !== t.organizer.user_id ? (
                    <button
                      type="button"
                      className="icon-btn tplayer-x"
                      aria-label={`Remove ${p.username}`}
                      disabled={busy}
                      onClick={() => void act(() => removeTournamentPlayer(t.code, p.user_id))}
                    >
                      ✕
                    </button>
                  ) : isOrganizer ? (
                    <span className="tplayer-x" aria-hidden />
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="btn-row">
              {t.me.can_join ? (
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void act(() => joinTournament(t.code))}>
                  Join
                </button>
              ) : null}
              {t.me.role === "invited" ? (
                <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void act(() => leaveTournament(t.code))}>
                  Decline
                </button>
              ) : null}
              {t.me.role === "joined" ? (
                <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void act(() => leaveTournament(t.code))}>
                  Leave
                </button>
              ) : null}
            </div>
            {isOrganizer ? (
              <div className="tactions">
                <button type="button" className="btn btn-primary" disabled={busy || !t.me.can_start || blocker !== null} onClick={() => void act(() => startTournament(t.code))}>
                  Start tournament
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm("Cancel this tournament?")) void act(() => cancelTournament(t.code));
                  }}
                >
                  Cancel
                </button>
                <p className="field-hint">{blocker ?? `${joined} players ready. You can start with ${minPlayers(t.format, t.size)} or more.`}</p>
              </div>
            ) : null}
          </section>

          <div className="tcol">
            <section className="panel" aria-label="Share">
              <h2 className="panel-title">Share link</h2>
              <div className="field field-inline tshare">
                <input readOnly aria-label="Tournament link" value={`${window.location.origin}/tournaments/${t.code}`} onFocus={(e) => e.currentTarget.select()} />
                <button type="button" className="btn btn-secondary btn-sm tcopy" onClick={() => void copyLink()}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </section>
            {isOrganizer ? (
              <section className="panel" aria-label="Invite friends">
                <h2 className="panel-title">Invite friends</h2>
                {allInvitable.length > 6 ? (
                  <div className="field">
                    <input type="search" aria-label="Search friends" placeholder="Search friends" value={inviteQuery} onChange={(e) => setInviteQuery(e.target.value)} />
                  </div>
                ) : null}
                {invitable.length > 0 ? (
                  <ul className="tplayers">
                    {invitable.map((f) => (
                      <li key={f.user_id} className="tplayer">
                        <span className="tplayer-name">{f.username}</span>
                        <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void act(() => inviteToTournament(t.code, f.user_id))}>
                          Invite
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="panel-copy tnote">{!friends.state ? "Loading friends…" : allInvitable.length > 0 ? "No friends match that search." : "No friends left to invite."}</p>
                )}
              </section>
            ) : null}
          </div>
        </div>
      ) : null}

      {t.status === "running" && t.me.role !== null ? <YourMatch t={t} next={next} myId={myId} busy={busy} deck={deck} onPlay={play} /> : null}

      {started && t.format === "single_elim" ? (
        <section className="panel tbracket-panel" aria-label="Bracket">
          <h2 className="panel-title">Bracket</h2>
          <Bracket
            matches={t.matches}
            rounds={t.rounds}
            next={next}
            myId={myId}
            nextId={next?.id ?? null}
            organizer={isOrganizer}
            busy={busy}
            onPlay={play}
            onAward={(mm, p) => void act(() => awardTournamentMatch(t.code, mm.id, p.user_id))}
          />
        </section>
      ) : null}

      {started && t.format === "round_robin" ? (
        <>
          <section className="panel" aria-label="Standings">
            <h2 className="panel-title">Standings</h2>
            <div className="tscroll">
              <table className="tstand">
                <thead>
                  <tr>
                    <th className="tstand-rank">#</th>
                    <th>Player</th>
                    <th>W</th>
                    <th>L</th>
                    <th>Played</th>
                  </tr>
                </thead>
                <tbody>
                  {t.standings.map((r) => (
                    <tr key={r.user_id} data-me={r.user_id === myId || undefined}>
                      <td className="tstand-rank">{r.rank}</td>
                      <td className="tstand-name">{r.username}</td>
                      <td>{r.wins}</td>
                      <td>{r.losses}</td>
                      <td>{r.played}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {rounds.map((r) => {
            const done = !roundStartsOpen(r.matches);
            return (
              <details key={r.round} className="panel tround-rr" aria-label={`Round ${r.round}`} open={!done}>
                <summary className="tround-sum">
                  <h2 className="panel-title">
                    Round {r.round}
                    {done ? " · done" : ""}
                  </h2>
                </summary>
                <div className="tmatch-grid">
                  {r.matches.map((m) => (
                    <MatchCard
                      key={m.id}
                      m={m}
                      myId={myId}
                      nextId={next?.id ?? null}
                      organizer={isOrganizer}
                      busy={busy}
                      onPlay={play}
                      onAward={(mm, p) => void act(() => awardTournamentMatch(t.code, mm.id, p.user_id))}
                    />
                  ))}
                </div>
              </details>
            );
          })}
        </>
      ) : null}

      {t.status === "running" && isOrganizer ? (
        <div className="tactions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={() => {
              if (window.confirm("Cancel this tournament?")) void act(() => cancelTournament(t.code));
            }}
          >
            Cancel tournament
          </button>
        </div>
      ) : null}
    </PageShell>
  );
}
