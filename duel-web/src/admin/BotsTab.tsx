import { type AdminBots } from "./adminApi";
import { BarChart, ScoreChart, Tile } from "./charts";
import { dateOf, evalVerdict, percent } from "./adminLogic";

const n = (v: number) => v.toLocaleString("en-US");

export function BotsTab({ data }: { data: AdminBots }) {
  const b = data.bot_games;
  const verdict = evalVerdict(data.evals, b.first_game_at);
  const days = b.by_day.map((d) => d.day);
  const firstDay = b.first_game_at ? dateOf(b.first_game_at) : null;
  const markerIdx = firstDay ? days.indexOf(firstDay) : -1;
  const groups = [...new Set(data.evals.flatMap((e) => Object.keys(e.groups)))].sort();
  return (
    <>
      <section className={`panel adm-verdict adm-verdict-${verdict.kind}`} aria-label="Did bot games help">
        <h2 className="panel-title">Did bot games improve Log Pose?</h2>
        <p className="panel-copy adm-verdict-text" role="status">
          {verdict.text}
        </p>
        {verdict.kind === "compared" ? (
          <ul className="adm-groups">
            {verdict.groups.map((g) => (
              <li key={g.group}>
                <span>Group {g.group}</span>
                <span>
                  {g.before} → {g.after}
                </span>
                <b className={g.points > 0.05 ? "up" : g.points < -0.05 ? "down" : ""}>
                  {g.points > 0 ? "+" : ""}
                  {g.points.toFixed(1)}
                </b>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="adm-tiles" aria-label="Bot games">
        <Tile label="Bot games" value={n(b.total)} sub={`${n(b.finished)} finished, ${n(b.unfinished)} not`} />
        <Tile label="First / last game" value={b.first_game_at ? dateOf(b.first_game_at).slice(5) : "—"} sub={b.last_game_at ? `last ${dateOf(b.last_game_at)}` : undefined} />
        <Tile label="Leaders / matchups" value={`${n(b.leaders)} / ${n(b.matchups)}`} />
        <Tile label="Avg turns" value={b.avg_turns == null ? "—" : b.avg_turns.toFixed(1)} />
        <Tile label="First seat wins" value={b.first_seat_win_rate == null ? "—" : `${(b.first_seat_win_rate * 100).toFixed(1)}%`} />
      </section>

      <section className="panel" aria-label="Bot games per night">
        <h2 className="panel-title">Bot games per night, last 14 days</h2>
        <BarChart
          title="Bot games per night"
          days={days}
          series={[
            { key: "finished", label: "Finished", color: "var(--chrome)" },
            { key: "rest", label: "Not finished", color: "var(--muted)" },
          ]}
          values={{ finished: b.by_day.map((d) => d.finished), rest: b.by_day.map((d) => Math.max(d.games - d.finished, 0)) }}
        />
        {b.last_batch_id ? <p className="adm-note">Latest batch {b.last_batch_id}</p> : null}
      </section>

      <section className="panel" aria-label="Eval history">
        <h2 className="panel-title">Eval history</h2>
        <ScoreChart
          points={data.evals.map((e) => ({ at: Date.parse(e.run_at), pct: (e.correct / e.total) * 100, label: e.label }))}
          markerAt={b.first_game_at ? Date.parse(b.first_game_at) : null}
          markerLabel={firstDay ? `Bot games start ${firstDay}` : ""}
        />
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th className="adm-sticky">Run</th>
                <th className="adm-col-date">Date</th>
                <th className="num">Score</th>
                {groups.map((g) => (
                  <th key={g} className="num">
                    {g}
                  </th>
                ))}
                <th className="num">Spend</th>
              </tr>
            </thead>
            <tbody>
              {data.evals.map((e) => (
                <tr key={`${e.run_at}-${e.label}`}>
                  <td className="adm-sticky">
                    <div className="adm-run">
                      <b>{e.label}</b>
                      <small>{e.model}</small>
                      <small className="adm-run-date">{dateOf(e.run_at)}</small>
                      {e.notes ? <small className="adm-run-notes">{e.notes}</small> : null}
                    </div>
                  </td>
                  <td className="adm-col-date">{dateOf(e.run_at)}</td>
                  <td className="num">
                    <b>{percent(e.correct, e.total)}</b>
                    <small>
                      {e.correct}/{e.total}
                    </small>
                  </td>
                  {groups.map((g) => (
                    <td key={g} className="num">
                      {e.groups[g] ? `${e.groups[g]!.correct}/${e.groups[g]!.total}` : "—"}
                    </td>
                  ))}
                  <td className="num">{e.spend_usd == null ? "—" : `$${e.spend_usd.toFixed(2)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
