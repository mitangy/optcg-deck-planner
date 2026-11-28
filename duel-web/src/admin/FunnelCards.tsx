import { useAsyncResource } from "../lib/useAsyncResource";
import { type AdminFunnel, fetchAdminFunnel } from "./adminApi";
import { formatCount as n, type RangeDays } from "./adminLogic";
import { funnelRows, retentionRows } from "./funnelLogic";

export function FunnelCards({ days, stale = false, load = fetchAdminFunnel }: { days: RangeDays; stale?: boolean; load?: (days: number) => Promise<AdminFunnel> }) {
  const res = useAsyncResource(() => load(days), [days]);
  if (res.status === "error") {
    return (
      <section className="panel" aria-label="Funnel and return visits">
        <p className="panel-copy adm-error" role="alert">
          Could not load the funnel: {(res.error as Error).message}
        </p>
      </section>
    );
  }
  // Both cards keep their size while loading, so the page below them does not jump when the numbers land.
  const data = res.status === "ready" ? res.data : null;
  const rows = data ? funnelRows(data.steps) : [];
  const cohorts = data ? retentionRows(data.retention) : [];
  return (
    <div className={`adm-grid2 adm-funnel-grid${stale || !data ? " adm-stale" : ""}`}>
      <section className="panel" aria-label="Funnel">
        <h2 className="panel-title">Funnel, last {days} days</h2>
        {data && rows.every((r) => r.events === 0) ? (
          <p className="panel-copy adm-muted">No events yet. They arrive as people use the apps.</p>
        ) : (
          <ol className="adm-funnel">
            {(data ? rows : PLACEHOLDER_ROWS).map((r) => (
              <li key={r.step} className="adm-funnel-row">
                <span className="adm-funnel-label">{r.label}</span>
                <span className="adm-funnel-num">{data ? n(r.visitors) : "—"}</span>
                <span className="adm-funnel-pct">{r.ofPrevious ?? ""}</span>
                <span className="adm-funnel-bar" aria-hidden>
                  <i style={{ width: `${r.barPct}%` }} />
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className="adm-note">Distinct visitors per step, not one path: a step counts people who did it, whether or not they did the one above. The percentage is against the step above.</p>
      </section>

      <section className="panel" aria-label="Return visits">
        <h2 className="panel-title">Return visits by signup week</h2>
        {data && cohorts.length === 0 ? (
          <p className="panel-copy adm-muted">No signups in these weeks.</p>
        ) : (
          <table className="adm-table adm-retention">
            <thead>
              <tr>
                <th scope="col">Signed up</th>
                <th scope="col" className="num">
                  Accounts
                </th>
                <th scope="col" className="num">
                  Day 1
                </th>
                <th scope="col" className="num">
                  Day 7
                </th>
              </tr>
            </thead>
            <tbody>
              {(data ? cohorts : []).map((c) => (
                <tr key={c.week}>
                  <th scope="row">Week of {c.week}</th>
                  <td className="num">{c.size}</td>
                  <td className="num" title={c.d1Detail}>
                    {c.d1}
                  </td>
                  <td className="num" title={c.d7Detail}>
                    {c.d7}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="adm-note">Real accounts seen on day 1 or later / day 7 or later after signing up, from the last day they were seen and their match history. Accounts too new for that day are left out.</p>
      </section>
    </div>
  );
}

const PLACEHOLDER_ROWS = ["Landed on a guide page", "Saw the home page", "Started a game", "Finished a game", "Signed up"].map((label) => ({ step: label, label, visitors: 0, events: 0, barPct: 0, ofPrevious: null as string | null }));
