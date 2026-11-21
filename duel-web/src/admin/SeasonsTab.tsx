import { useState } from "react";
import { Link } from "react-router-dom";
import { Dialog, DialogTitle } from "@optcg/ui/popups";
import { BountyAmount } from "../Bounty";
import { seasonDate } from "../lib/seasonDate";
import { type AdminSeasons, type SeasonResetMode, startAdminSeason } from "./adminApi";
import { canStartSeason } from "./adminLogic";

const MODES: readonly { id: SeasonResetMode; title: string; blurb: string }[] = [
  { id: "soft", title: "Soft (recommended)", blurb: "Everyone moves halfway back to 1,000 and replays 10 placement games." },
  { id: "hard", title: "Hard", blurb: "Everyone back to 1,000, and replays 10 placement games." },
];

function startedText(startedAt: string | null | undefined): string {
  return startedAt ? `started ${seasonDate(startedAt)}` : "since launch";
}

function StartDialog({ data, onClose, onStarted }: { data: AdminSeasons; onClose: () => void; onStarted: (name: string) => void }) {
  const current = data.current;
  const [mode, setMode] = useState<SeasonResetMode>("soft");
  const [name, setName] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = canStartSeason(typed, current.name);

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const started = await startAdminSeason(mode, name, typed.trim());
      onStarted(started.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not work.");
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={() => (busy ? undefined : onClose())} className="feedback-backdrop" panelClassName="feedback-card report-card">
      <DialogTitle className="feedback-title">Start a new season</DialogTitle>
      <form
        className="upl-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="adm-muted upl-hint">
          {current.name} ends now and its standings are kept on the leaderboard. Everyone's games played go back to 0. This cannot be undone.
        </p>
        <fieldset className="ssn-modes" disabled={busy}>
          <legend className="visually-hidden">Reset</legend>
          {MODES.map((m) => (
            <label key={m.id} className={`ssn-mode${mode === m.id ? " active" : ""}`}>
              <input type="radio" name="season-reset" value={m.id} checked={mode === m.id} onChange={() => setMode(m.id)} />
              <span>
                <b>{m.title}</b>
                <small>{m.blurb}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <label className="rpt-field">
          <span>New season name (optional)</span>
          <input type="text" value={name} maxLength={64} disabled={busy} placeholder={`Season ${current.number + 1}`} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="rpt-field">
          <span>
            Type <b>{current.name}</b> to confirm
          </span>
          <input type="text" value={typed} disabled={busy} autoComplete="off" autoCapitalize="off" spellCheck={false} onChange={(e) => setTyped(e.target.value)} />
        </label>
        <p className="adm-error rpt-error" role="alert">
          {error ?? ""}
        </p>
        <div className="rpt-panel-actions">
          <button type="submit" className="btn btn-primary btn-sm rpt-ban-confirm" disabled={busy || !ready}>
            Start new season
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function SeasonsTab({ data, onChanged }: { data: AdminSeasons; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const { current, preview, past } = data;

  return (
    <>
      <section className="panel ssn-current" aria-label="Current season">
        <div className="ssn-current-text">
          <h2 className="panel-title">{current.name}</h2>
          <p className="panel-copy adm-muted">
            {startedText(current.started_at)} · {current.players.toLocaleString("en-US")} {current.players === 1 ? "player" : "players"} ranked
          </p>
        </div>
        <button type="button" className="btn btn-primary btn-sm ssn-start" onClick={() => setOpen(true)}>
          Start new season
        </button>
      </section>
      {note ? (
        <p className="panel-copy ssn-note" role="status">
          {note}
        </p>
      ) : null}

      <section className="panel" aria-label="Reset preview">
        <h2 className="panel-title">What a reset does</h2>
        <p className="adm-note">Top {preview.length || 20} players now. Soft moves everyone halfway back to 1,000, hard puts everyone on 1,000.</p>
        {preview.length === 0 ? (
          <p className="panel-copy adm-muted">Nobody is ranked yet.</p>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table ssn-table">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Player</th>
                  <th className="num">Now</th>
                  <th className="num">Soft</th>
                  <th className="num">Hard</th>
                  <th className="num">Games</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r) => (
                  <tr key={r.user_id}>
                    <td className="num">{r.rank}</td>
                    <td className="ssn-player" title={r.name}>
                      {r.name}
                    </td>
                    <td className="num">
                      <BountyAmount amount={r.rating} />
                    </td>
                    <td className="num">
                      <BountyAmount amount={r.soft_after} />
                    </td>
                    <td className="num">
                      <BountyAmount amount={r.hard_after} />
                    </td>
                    <td className="num">{r.games}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel" aria-label="Past seasons">
        <h2 className="panel-title">Past seasons</h2>
        {past.length === 0 ? (
          <p className="panel-copy adm-muted">No season has ended yet.</p>
        ) : (
          <ul className="adm-rows adm-season-past">
            {past.map((s) => (
              <li key={s.number}>
                <span className="adm-rows-main">
                  <b>{s.name}</b>
                  <small>
                    {s.started_at ? seasonDate(s.started_at) : "Launch"} to {seasonDate(s.ended_at)} · {s.reset_mode ?? "no"} reset · {s.players} {s.players === 1 ? "player" : "players"}
                  </small>
                </span>
                <Link className="btn btn-secondary btn-sm" to={`/leaderboard?season=${s.number}`}>
                  Standings
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {open ? (
        <StartDialog
          data={data}
          onClose={() => setOpen(false)}
          onStarted={(name) => {
            setOpen(false);
            setNote(`${name} has started. Everyone's Bounty was reset and the old standings are kept.`);
            onChanged();
          }}
        />
      ) : null}
    </>
  );
}
