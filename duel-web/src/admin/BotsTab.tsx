import { useEffect, useRef, useState } from "react";
import { type AdminBots, type EvalRun } from "./adminApi";
import { BarChart, RangePicker, Tile, TrendChart } from "./charts";
import {
  ariaSort,
  chartScale,
  dateOf,
  evalVerdict,
  groupBySuite,
  headlineOf,
  nextSort,
  type RangeDays,
  runRowId,
  type RunSortKey,
  type SortState,
  sortedRunRows,
  spendText,
  suiteSummary,
  type SuiteInfo,
} from "./adminLogic";
import { FeedbackSection } from "./FeedbackSection";

const n = (v: number) => v.toLocaleString("en-US");

const ARROW = { better: "\u2191", worse: "\u2193", same: "\u2192", first: "" } as const;

function RunSortHead({ label, k, sort, onSort, className }: { label: string; k: RunSortKey; sort: SortState<RunSortKey>; onSort: (k: RunSortKey) => void; className?: string }) {
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

/** One eval suite: its trend line, and a table of every run with how it compares to the run before. */
function SuiteHistory({ suite, runs, markerAt, markerLabel }: { suite: SuiteInfo; runs: EvalRun[]; markerAt: number | null; markerLabel: string }) {
  const groups = [...new Set(runs.flatMap((e) => Object.keys(e.groups)))].sort();
  const [sort, setSort] = useState<SortState<RunSortKey>>({ key: "date", dir: "asc" });
  const [flash, setFlash] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  // Each row's change is worked out oldest first, then the rows are sorted: sorting never changes what "previous" means.
  const rows = sortedRunRows(runs, sort);
  const onSort = (k: RunSortKey) => setSort((cur) => nextSort(cur, k, k === "date" ? "asc" : "desc"));
  const jumpTo = (id: string) => {
    // Scroll the page only: scrollIntoView would also slide a wide table sideways under its sticky column.
    const row = document.getElementById(id);
    if (row) window.scrollBy({ top: row.getBoundingClientRect().top + row.offsetHeight / 2 - window.innerHeight / 2, behavior: "smooth" });
    setFlash(id);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setFlash(null), 1800);
  };
  const heads = runs.map(headlineOf);
  const last = heads[heads.length - 1];
  const kind = last?.kind ?? "pct";
  const points = runs.flatMap((e, i) =>
    heads[i] ? [{ at: Date.parse(e.run_at), value: heads[i]!.value, label: e.label, id: runRowId(suite.id, e), date: dateOf(e.run_at), spend: e.spend_usd }] : [],
  );
  const scale = chartScale(points.map((p) => p.value), kind);
  const titleId = `adm-suite-${suite.id}`;
  return (
    <section className="panel" aria-labelledby={titleId} data-suite={suite.id}>
      <h2 className="panel-title" id={titleId}>
        {suite.label}
      </h2>
      <p className="adm-note">{suite.blurb}</p>
      <p className="panel-copy adm-suite-summary" role="status">
        {suiteSummary(runs)}
      </p>
      <TrendChart
        points={points}
        scale={scale}
        format={(v) => (kind === "pct" ? `${Math.round(v)}%` : String(Math.round(v * 100) / 100))}
        name={last?.name ?? "Score"}
        hint={last?.lowerIsBetter ? "lower is better" : undefined}
        markerAt={markerAt}
        markerLabel={markerLabel}
        onSelectPoint={jumpTo}
      />
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th className="adm-sticky">Run</th>
              <RunSortHead label="Date" k="date" sort={sort} onSort={onSort} className="adm-col-date" />
              <RunSortHead label={last?.kind === "metric" ? last.name : "Score"} k="score" sort={sort} onSort={onSort} className="num" />
              <th>vs previous</th>
              {groups.map((g) => (
                <th key={g} className="num">
                  {g}
                </th>
              ))}
              <RunSortHead label="Spend" k="spend" sort={sort} onSort={onSort} className="num" />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ run: e, change }) => {
              const h = headlineOf(e);
              return (
                <tr key={`${e.run_at}-${e.label}`} id={runRowId(suite.id, e)} className={flash === runRowId(suite.id, e) ? "adm-row-flash" : undefined}>
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
                    <b>{h ? h.text : "—"}</b>
                    {e.correct != null && e.total != null ? (
                      <small>
                        {h?.kind === "metric" ? `${e.correct}/${e.total} supported` : `${e.correct}/${e.total}`}
                      </small>
                    ) : null}
                  </td>
                  <td className={`adm-change adm-change-${change.direction}`}>
                    {ARROW[change.direction]} {change.text}
                  </td>
                  {groups.map((g) => (
                    <td key={g} className="num">
                      {e.groups[g] ? `${e.groups[g]!.correct}/${e.groups[g]!.total}` : "—"}
                    </td>
                  ))}
                  <td className="num">{spendText(e.spend_usd)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function BotsTab({ data, days, onDaysChange, stale = false }: { data: AdminBots; days: RangeDays; onDaysChange: (days: RangeDays) => void; stale?: boolean }) {
  const b = data.bot_games;
  const verdict = evalVerdict(data.evals, b.first_game_at);
  const dayList = b.by_day.map((d) => d.day);
  const firstDay = b.first_game_at ? dateOf(b.first_game_at) : null;
  const suites = groupBySuite(data.evals);
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
        <div className="adm-panel-head">
          <h2 className="panel-title">Bot games per night, last {data.days ?? 14} days</h2>
          <RangePicker value={days} onChange={onDaysChange} label="Bot games date range in days" busy={stale} />
        </div>
        <div className={stale ? "adm-stale" : undefined}>
        <BarChart
          title="Bot games per night"
          days={dayList}
          series={[
            { key: "finished", label: "Finished", color: "var(--chrome)" },
            { key: "rest", label: "Not finished", color: "var(--muted)" },
          ]}
          values={{ finished: b.by_day.map((d) => d.finished), rest: b.by_day.map((d) => Math.max(d.games - d.finished, 0)) }}
        />
        </div>
        {b.last_batch_id ? <p className="adm-note">Latest batch {b.last_batch_id}</p> : null}
      </section>

      {suites.length === 0 ? (
        <section className="panel" aria-label="Eval history">
          <h2 className="panel-title">Eval history</h2>
          <p className="panel-copy adm-muted">No eval runs recorded yet.</p>
        </section>
      ) : (
        suites.map(({ suite, runs }) => (
          <SuiteHistory
            key={suite.id}
            suite={suite}
            runs={runs}
            markerAt={suite.id === "main" && b.first_game_at ? Date.parse(b.first_game_at) : null}
            markerLabel={firstDay ? `Bot games start ${firstDay}` : ""}
          />
        ))
      )}

      <FeedbackSection />
    </>
  );
}
