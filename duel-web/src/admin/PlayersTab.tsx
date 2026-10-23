import { lookupCard } from "../cards/atlas";
import { type AdminOverview } from "./adminApi";
import { BarChart, Tile } from "./charts";
import { percent } from "./adminLogic";

const n = (v: number) => v.toLocaleString("en-US");

export function PlayersTab({ data }: { data: AdminOverview }) {
  const { accounts: a, active, matches: m, planner, log_pose: lp } = data;
  const sDays = data.signups_by_day.map((d) => d.day);
  const mDays = data.matches_by_day.map((d) => d.day);
  const topMax = Math.max(1, ...data.top_leaders_30d.map((l) => l.games));
  return (
    <>
      <section className="adm-tiles" aria-label="Accounts">
        <Tile label="Real accounts" value={n(a.real)} sub={`${n(a.new_7d)} new in 7 days`} />
        <Tile label="Guests" value={n(a.guests)} sub={`${n(a.new_30d)} new accounts in 30 days`} />
        <Tile label="Active today" value={n(active.d1)} sub="players with a match" />
        <Tile label="Active, 7 days" value={n(active.d7)} sub={`${n(active.real_d7)} real`} />
        <Tile label="Active, 30 days" value={n(active.d30)} sub={`${n(active.real_d30)} real`} />
        <Tile label="Staff / banned" value={`${n(a.staff)} / ${n(a.banned)}`} />
      </section>

      <div className="adm-grid2">
        <section className="panel" aria-label="Signups per day">
          <h2 className="panel-title">Signups per day, last 30 days</h2>
          <BarChart
            title="Signups per day"
            days={sDays}
            series={[
              { key: "real", label: "Real", color: "var(--chrome)" },
              { key: "guests", label: "Guests", color: "var(--sea)" },
            ]}
            values={{ real: data.signups_by_day.map((d) => d.real), guests: data.signups_by_day.map((d) => d.guests) }}
          />
        </section>
        <section className="panel" aria-label="Matches per day">
          <h2 className="panel-title">Matches per day, last 30 days</h2>
          <BarChart
            title="Matches per day"
            days={mDays}
            series={[
              { key: "ranked", label: "Ranked", color: "var(--chrome)" },
              { key: "casual", label: "Casual", color: "var(--sea)" },
            ]}
            values={{ ranked: data.matches_by_day.map((d) => d.ranked), casual: data.matches_by_day.map((d) => d.casual) }}
          />
        </section>
      </div>

      <section className="adm-tiles" aria-label="Matches">
        <Tile label="Matches, all time" value={n(m.total)} />
        <Tile label="Matches, 7 days" value={n(m.last_7d)} sub={`${n(m.ranked_7d)} ranked`} />
        <Tile label="Avg turns, 30 days" value={m.avg_turns_30d == null ? "—" : m.avg_turns_30d.toFixed(1)} />
        <Tile label="Decks in planner" value={n(planner.decks)} sub={`${n(planner.users_with_decks)} users`} />
      </section>

      <div className="adm-grid2">
        <section className="panel" aria-label="Top leaders">
          <h2 className="panel-title">Top leaders, last 30 days</h2>
          {data.top_leaders_30d.length === 0 ? (
            <p className="panel-copy adm-muted">No matches in the last 30 days.</p>
          ) : (
            <ol className="adm-leaders">
              {data.top_leaders_30d.map((l) => (
                <li key={l.leader_id} className="adm-leader">
                  <span className="adm-leader-name" title={l.leader_id}>
                    {lookupCard(l.leader_id).name}
                    <small>{l.leader_id}</small>
                  </span>
                  <span className="adm-leader-bar" aria-hidden>
                    <i style={{ width: `${(l.games / topMax) * 100}%` }} />
                  </span>
                  <span className="adm-leader-num">{l.games}</span>
                  <span className="adm-leader-win">{percent(l.wins, l.games)}</span>
                </li>
              ))}
            </ol>
          )}
          <p className="adm-note">Games played, then win rate.</p>
        </section>
        <section className="panel" aria-label="Log Pose usage">
          <h2 className="panel-title">Log Pose, this month</h2>
          <div className="adm-tiles adm-tiles-inner">
            <Tile label="Questions" value={n(lp.questions_month)} />
            <Tile label="Spend" value={`$${lp.spend_month_usd.toFixed(2)}`} />
            <Tile label="Players with access" value={n(lp.users_with_access)} />
          </div>
        </section>
      </div>
      <p className="adm-note">Updated {data.generated_at.replace("T", " ").slice(0, 16)} UTC</p>
    </>
  );
}
