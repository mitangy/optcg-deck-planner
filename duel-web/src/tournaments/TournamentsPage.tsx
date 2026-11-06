import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Select } from "@optcg/ui/popups";
import { NavMenu } from "../nav/NavMenu";
import { googleLoginUrl } from "../net/api";
import { BackLink } from "../pages/BackLink";
import { TIMER_PRESET_OPTIONS, type TimerPreset } from "../home/timerPreset";
import { ROUND_ROBIN_SIZES, SINGLE_ELIM_SIZES } from "./bracket";
import { useTournaments, useWho } from "./hooks";
import { TournamentRow } from "./TournamentRow";
import { createTournament, joinTournament, leaveTournament, type TournamentFormat } from "./tournamentApi";
import "./tournaments.css";

const FORMAT_OPTIONS = [
  { value: "single_elim" as TournamentFormat, label: "Tournament (single elimination)" },
  { value: "round_robin" as TournamentFormat, label: "Round robin" },
];

function CreateForm() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [format, setFormat] = useState<TournamentFormat>("single_elim");
  const [size, setSize] = useState(8);
  const [timer, setTimer] = useState<TimerPreset>("seat_15m");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sizes = format === "single_elim" ? SINGLE_ELIM_SIZES : ROUND_ROBIN_SIZES;
  const sizeOptions = sizes.map((n) => ({
    value: n,
    label: format === "single_elim" ? `${n} players` : `Up to ${n} players`,
  }));

  function pickFormat(f: TournamentFormat) {
    setFormat(f);
    setSize(f === "single_elim" ? 8 : 4);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const t = await createTournament({ name, format, size, timer });
      navigate(`/tournaments/${t.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the tournament");
      setBusy(false);
    }
  }

  return (
    <form
      className="panel tcreate"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h2 className="panel-title">New tournament</h2>
      <div className="field">
        <label htmlFor="t-name">Name</label>
        <input id="t-name" maxLength={60} placeholder="Friday night bracket" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="t-format">Format</label>
        <Select<TournamentFormat> id="t-format" value={format} onChange={pickFormat} options={FORMAT_OPTIONS} />
      </div>
      <div className="field">
        <label htmlFor="t-size">{format === "single_elim" ? "Bracket size" : "Players"}</label>
        <Select<number> id="t-size" value={size} onChange={setSize} options={sizeOptions} />
        <p className="field-hint">
          {format === "single_elim"
            ? "Everyone plays one game per round. Lose and you are out."
            : "Everyone plays everyone once. Most wins takes first."}
        </p>
      </div>
      <div className="field">
        <label htmlFor="t-timer">Timer</label>
        <Select<TimerPreset> id="t-timer" value={timer} onChange={setTimer} options={TIMER_PRESET_OPTIONS} />
      </div>
      {error ? <p className="error-text">{error}</p> : null}
      <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
        Create tournament
      </button>
    </form>
  );
}

export function TournamentsPage() {
  const who = useWho();
  const { list, error, refresh } = useTournaments(who.status === "ready");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const navigate = useNavigate();

  async function answer(code: string, id: number, accept: boolean) {
    setBusyId(id);
    setNote(null);
    try {
      if (accept) {
        await joinTournament(code);
        navigate(`/tournaments/${code}`);
        return;
      }
      await leaveTournament(code);
      await refresh();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  const invites = (list ?? []).filter((t) => t.my_role === "invited" && t.status === "open");
  const rest = (list ?? []).filter((t) => !invites.includes(t));

  return (
    <div className="app-shell">
      <div className="page tpage">
        <header className="page-header">
          <NavMenu />
          <BackLink to="/" label="Home" ariaLabel="Back to home" />
          <h1 className="page-title">Tournaments</h1>
        </header>

        {who.status === "loading" ? <p className="panel-copy tnote">Loading…</p> : null}
        {who.status === "signed-out" ? (
          <section className="panel">
            <p className="panel-copy">Sign in to run or join a tournament with your friends.</p>
            <div className="btn-row">
              <a className="btn btn-primary" href={googleLoginUrl()}>
                Sign in with Google
              </a>
            </div>
          </section>
        ) : null}
        {who.status === "no-username" ? (
          <section className="panel">
            <p className="panel-copy">Pick a username first so your friends can find you.</p>
            <div className="btn-row">
              <Link className="btn btn-primary" to="/welcome/username">
                Pick a username
              </Link>
            </div>
          </section>
        ) : null}

        {who.status === "ready" ? (
          <div className="tgrid">
            <div className="tcol">
              {note ? <p className="error-text">{note}</p> : null}
              {error && !list ? <p className="error-text">{error}</p> : null}
              {invites.map((t) => (
                <section key={t.id} className="notice notice-gold" aria-label="Tournament invite">
                  <div className="notice-body">
                    <strong>{t.name}</strong>
                    <span>You are invited</span>
                  </div>
                  <div className="notice-actions">
                    <button type="button" className="btn btn-primary btn-sm" disabled={busyId === t.id} onClick={() => void answer(t.code, t.id, true)}>
                      Join
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={busyId === t.id} onClick={() => void answer(t.code, t.id, false)}>
                      Decline
                    </button>
                  </div>
                </section>
              ))}
              <section className="panel" aria-label="Your tournaments">
                <h2 className="panel-title">Your tournaments</h2>
                {rest.length > 0 ? (
                  <ul className="trow-list">
                    {rest.map((t) => (
                      <TournamentRow key={t.id} t={t} />
                    ))}
                  </ul>
                ) : (
                  <p className="panel-copy tnote">{list ? "None yet. Create one, or open a link a friend sent you." : "Loading…"}</p>
                )}
              </section>
            </div>
            <CreateForm />
          </div>
        ) : null}
      </div>
    </div>
  );
}
