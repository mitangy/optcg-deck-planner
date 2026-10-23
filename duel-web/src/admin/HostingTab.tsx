import type { ReactNode } from "react";
import type { AdminHosting, GithubData, ProviderResult, RenderData, VercelData } from "./adminApi";

function ago(iso: string | null | undefined): string {
  if (!iso) return "—";
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (mins < 60) return `${mins}m ago`;
  if (mins < 2880) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

function Status({ value }: { value: string | null | undefined }) {
  const v = (value ?? "unknown").toLowerCase();
  const tone = ["ready", "live", "success", "succeeded"].includes(v) ? "ok" : ["error", "failed", "failure", "build_failed", "canceled", "cancelled", "update_failed"].includes(v) ? "bad" : "mid";
  return <span className={`adm-pill adm-pill-${tone}`}>{value ?? "unknown"}</span>;
}

function Card<T>({ title, result, hint, children }: { title: string; result: ProviderResult<T> | undefined; hint: string; children: (d: T) => ReactNode }) {
  let body: ReactNode;
  if (!result) body = <p className="panel-copy adm-muted">No data.</p>;
  else if (!result.configured) {
    body = (
      <p className="panel-copy adm-muted adm-placeholder">
        <b>Not connected</b> — {hint}
      </p>
    );
  } else if (result.error !== undefined) {
    body = (
      <p className="panel-copy adm-error" role="alert">
        Could not load: {result.error}
      </p>
    );
  } else body = children(result as T);
  return (
    <section className="panel adm-host" aria-label={title}>
      <h2 className="panel-title">{title}</h2>
      {body}
    </section>
  );
}

function Rows({ rows }: { rows: { key: string; name: ReactNode; sub?: ReactNode; status: ReactNode; when?: string }[] }) {
  return (
    <ul className="adm-rows">
      {rows.map((r) => (
        <li key={r.key}>
          <span className="adm-rows-main">
            <b>{r.name}</b>
            {r.sub ? <small>{r.sub}</small> : null}
          </span>
          {r.status}
          {r.when ? <small className="adm-rows-when">{r.when}</small> : null}
        </li>
      ))}
    </ul>
  );
}

export function HostingTab({ data }: { data: AdminHosting }) {
  return (
    <div className="adm-grid2">
      <Card<VercelData> title="Vercel" result={data.vercel} hint="add VERCEL_TOKEN (+ VERCEL_TEAM_ID) to the optcg-api service on Render">
        {(d) => (
          <Rows
            rows={d.projects.map((p) => ({
              key: p.name,
              name: p.name,
              sub: `${p.deploys_7d} production deploys in 7 days${p.latest?.commit ? ` · ${p.latest.commit}` : ""}`,
              status: <Status value={p.latest?.state} />,
              when: ago(p.latest?.created_at),
            }))}
          />
        )}
      </Card>
      <Card<RenderData> title="Render" result={data.render} hint="add RENDER_API_KEY to the optcg-api service on Render">
        {(d) => (
          <Rows
            rows={d.services.map((s) => ({
              key: s.name,
              name: s.name,
              sub: `${s.type}${s.suspended && s.suspended !== "not_suspended" ? " · suspended" : ""}${s.latest?.commit ? ` · ${s.latest.commit}` : ""}`,
              status: <Status value={s.latest?.status} />,
              when: ago(s.latest?.finished_at),
            }))}
          />
        )}
      </Card>
      <Card<GithubData> title="GitHub" result={data.github} hint="add GITHUB_TOKEN to the optcg-api service on Render">
        {(d) => (
          <>
            <div className="adm-inline-stats">
              <span><b>{d.open_prs}</b> open PRs</span>
              <span><b>{d.open_issues ?? "—"}</b> open issues</span>
              <span><b>{d.commits_7d}</b> commits in 7 days</span>
              <span><b>{d.stars ?? "—"}</b> stars</span>
              <span>{d.traffic_views ? <><b>{d.traffic_views.count}</b> views ({d.traffic_views.uniques} unique)</> : "Traffic not available"}</span>
            </div>
            <h3 className="adm-sub">CI on main</h3>
            <Rows rows={d.ci_runs.map((r, i) => ({ key: `ci${i}`, name: r.name, status: <Status value={r.conclusion ?? "running"} />, when: ago(r.created_at) }))} />
            <h3 className="adm-sub">Nightly bot games</h3>
            <Rows rows={d.bot_runs.map((r, i) => ({ key: `bot${i}`, name: r.name, status: <Status value={r.conclusion ?? "running"} />, when: ago(r.created_at) }))} />
          </>
        )}
      </Card>
    </div>
  );
}
