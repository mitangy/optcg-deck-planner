import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { lookupCard } from "../cards/atlas";
import { type AdminDayMatches, type AdminOverview, type DayMatch, fetchAdminMatches } from "./adminApi";
import { BarChart, RangePicker, Tile } from "./charts";
import { ariaSort, dayLabel, type LeaderRow, type LeaderSortKey, nextSort, percent, type RangeDays, type SortState, sortLeaders, timeOf } from "./adminLogic";

const n = (v: number) => v.toLocaleString("en-US");

const LEADERS_SHOWN = 10;

function SortHead({ label, k, sort, onSort, className }: { label: string; k: LeaderSortKey; sort: SortState<LeaderSortKey>; onSort: (k: LeaderSortKey) => void; className?: string }) {
  const dir = ariaSort(sort, k);
  return (
    <th scope="col" className={className} aria-sort={dir}>
      <button type="button" className="adm-sort" onClick={() => onSort(k)}>
        {label}
        <span className="adm-sort-mark" aria-hidden>
          {dir === "ascending" ? "\u25B2" : dir === "descending" ? "\u25BC" : ""}
        </span>
      </button>
    </th>
  );
}

/** Top leaders as a table: click a header to sort, ten rows until "Show all". */
function LeadersTable({ rows }: { rows: LeaderRow[] }) {
  const [sort, setSort] = useState<SortState<LeaderSortKey>>({ key: "games", dir: "desc" });
  const [all, setAll] = useState(false);
  const sorted = sortLeaders(rows, sort);
  const shown = all ? sorted : sorted.slice(0, LEADERS_SHOWN);
  const topMax = Math.max(1, ...rows.map((l) => l.games));
  const onSort = (k: LeaderSortKey) => setSort((cur) => nextSort(cur, k, k === "name" ? "asc" : "desc"));
  return (
    <>
      <table className="adm-table adm-leaders-table">
        <thead>
          <tr>
            <SortHead label="Leader" k="name" sort={sort} onSort={onSort} />
            <SortHead label="Games" k="games" sort={sort} onSort={onSort} className="num" />
            <SortHead label="Wins" k="wins" sort={sort} onSort={onSort} className="num" />
            <SortHead label="Win rate" k="rate" sort={sort} onSort={onSort} className="num" />
          </tr>
        </thead>
        <tbody>
          {shown.map((l) => (
            <tr key={l.leader_id}>
              <td className="adm-leader-cell">
                <span className="adm-leader-name" title={l.leader_id}>
                  {l.name}
                  <small>{l.leader_id}</small>
                </span>
              </td>
              <td className="num adm-leader-games">
                <span className="adm-leader-num">{l.games}</span>
                <span className="adm-leader-bar" aria-hidden>
                  <i style={{ width: `${(l.games / topMax) * 100}%` }} />
                </span>
              </td>
              <td className="num">{l.wins}</td>
              <td className="num adm-leader-win">{percent(l.wins, l.games)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > LEADERS_SHOWN ? (
        <button type="button" className="btn btn-secondary btn-sm adm-more" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? `Show top ${LEADERS_SHOWN}` : `Show all ${rows.length}`}
        </button>
      ) : null}
    </>
  );
}

function MatchRow({ m }: { m: DayMatch }) {
  return (
    <li className="adm-match">
      <span className="adm-match-when">
        <b>{m.created_at ? timeOf(m.created_at) : "—"}</b>
        <small className={m.ranked ? "adm-match-ranked" : ""}>{m.ranked ? "Ranked" : "Casual"}</small>
      </span>
      {m.seats.map((s, i) => (
        <span key={i} data-seat={i} className={`adm-match-seat${s.won ? " won" : ""}`}>
          <span className="adm-match-leader">
            <b>{s.leader_id ? lookupCard(s.leader_id).name : "Unknown leader"}</b>
            {s.won ? <em className="adm-match-win">Winner</em> : null}
          </span>
          <small>{s.name ?? "Unknown player"}</small>
        </span>
      ))}
      <span className="adm-match-turns">{m.turns == null ? "—" : `${m.turns} turns`}</span>
      <Link className="adm-match-link" to={`/replay/${encodeURIComponent(m.id)}`}>
        Replay
      </Link>
    </li>
  );
}

/** The matches of one day, under the chart that was clicked. Its own box, so the chart above never moves. */
function DayMatchesPanel({ day, onClose, load }: { day: string; onClose: () => void; load: (day: string) => Promise<AdminDayMatches> }) {
  const [state, setState] = useState<{ day: string; status: "loading" | "error" | "ready"; data?: AdminDayMatches; message?: string }>({ day, status: "loading" });
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    let live = true;
    setState({ day, status: "loading" });
    load(day)
      .then((data) => live && setState({ day, status: "ready", data }))
      .catch((e: Error) => live && setState({ day, status: "error", message: e.message }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);
  useEffect(() => {
    box.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [day]);
  const list = state.data?.matches ?? [];
  return (
    <section className="panel adm-daymatches" aria-label={`Matches on ${day}`} ref={box}>
      <div className="adm-daymatches-head">
        <h2 className="panel-title">
          Matches on {dayLabel(day)}
          {state.status === "ready" ? <small>{list.length === 200 ? "first 200" : list.length}</small> : null}
        </h2>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} aria-label={`Close matches on ${day}`}>
          Close
        </button>
      </div>
      {state.status === "loading" ? (
        <p className="panel-copy adm-muted" role="status">
          Loading…
        </p>
      ) : state.status === "error" ? (
        <p className="panel-copy adm-error" role="alert">
          Could not load matches: {state.message}
        </p>
      ) : list.length === 0 ? (
        <p className="panel-copy adm-muted">No matches on this day.</p>
      ) : (
        <ul className="adm-matches">{list.map((m) => <MatchRow key={m.id} m={m} />)}</ul>
      )}
    </section>
  );
}

export function PlayersTab({
  data,
  days,
  onDaysChange,
  stale = false,
  loadMatches = fetchAdminMatches,
}: {
  data: AdminOverview;
  /** The window asked for; `data.days` is the one on screen until the fetch lands. */
  days: RangeDays;
  onDaysChange: (days: RangeDays) => void;
  stale?: boolean;
  loadMatches?: (day: string) => Promise<AdminDayMatches>;
}) {
  const { accounts: a, active, matches: m, planner, log_pose: lp } = data;
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const sDays = data.signups_by_day.map((d) => d.day);
  const mDays = data.matches_by_day.map((d) => d.day);
  const window = data.days ?? 30;
  const openDay = pickedDay && mDays.includes(pickedDay) ? pickedDay : null;
  const leaders: LeaderRow[] = (data.top_leaders ?? data.top_leaders_30d).map((l) => ({ ...l, name: lookupCard(l.leader_id).name }));
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

      <div className="adm-range-row">
        <span className="adm-range-label">Charts and top leaders</span>
        <RangePicker value={days} onChange={onDaysChange} label="Date range in days" busy={stale} />
      </div>

      <div className={`adm-grid2${stale ? " adm-stale" : ""}`}>
        <section className="panel" aria-label="Signups per day">
          <h2 className="panel-title">Signups per day, last {window} days</h2>
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
          <h2 className="panel-title">Matches per day, last {window} days</h2>
          <BarChart
            title="Matches per day"
            selectedDay={openDay}
            onSelectDay={setPickedDay}
            days={mDays}
            series={[
              { key: "ranked", label: "Ranked", color: "var(--chrome)" },
              { key: "casual", label: "Casual", color: "var(--sea)" },
            ]}
            values={{ ranked: data.matches_by_day.map((d) => d.ranked), casual: data.matches_by_day.map((d) => d.casual) }}
          />
        </section>
      </div>

      {openDay ? <DayMatchesPanel day={openDay} onClose={() => setPickedDay(null)} load={loadMatches} /> : null}

      <section className="adm-tiles" aria-label="Matches">
        <Tile label="Matches, all time" value={n(m.total)} />
        <Tile label="Matches, 7 days" value={n(m.last_7d)} sub={`${n(m.ranked_7d)} ranked`} />
        <Tile label="Avg turns, 30 days" value={m.avg_turns_30d == null ? "—" : m.avg_turns_30d.toFixed(1)} />
        <Tile label="Decks in planner" value={n(planner.decks)} sub={`${n(planner.users_with_decks)} users`} />
      </section>

      <div className="adm-grid2">
        <section className={`panel${stale ? " adm-stale" : ""}`} aria-label="Top leaders">
          <h2 className="panel-title">Top leaders, last {window} days</h2>
          {leaders.length === 0 ? <p className="panel-copy adm-muted">No matches in the last {window} days.</p> : <LeadersTable rows={leaders} />}
          <p className="adm-note">Games played, wins and win rate. Click a heading to sort.</p>
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
