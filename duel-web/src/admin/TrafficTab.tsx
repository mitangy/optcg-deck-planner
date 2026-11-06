import type { ReactNode } from "react";
import type { AdminTraffic, TrafficRender, TrafficRow, TrafficVercel } from "./adminApi";
import { againstLimit, coresText, countryName, deviceLabel, memoryText, referrerLabel, type RangeDays } from "./adminLogic";
import { BarChart, RangePicker, Tile } from "./charts";
import { Card } from "./HostingTab";

const n = (v: number) => v.toLocaleString("en-US");

/** A short ranked list: the name (cut with an ellipsis, full text on hover) and its visitors, right-aligned. */
function TopList({ title, rows, name }: { title: string; rows: TrafficRow[]; name: (key: string) => string }) {
  return (
    <section className="adm-toplist" aria-label={title}>
      <h4 className="adm-sub">{title}</h4>
      {rows.length === 0 ? (
        <p className="adm-note">No data yet.</p>
      ) : (
        <ul>
          {rows.map((r) => (
            <li key={r.key}>
              <span className="adm-toplist-name" title={name(r.key)}>
                {name(r.key)}
              </span>
              <b title={`${n(r.pageviews)} page views`}>{n(r.visitors)}</b>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Failed({ name, error }: { name: string; error: string }) {
  return (
    <div className="adm-traffic-block">
      <h3 className="adm-traffic-name">{name}</h3>
      <p className="panel-copy adm-error" role="alert">
        Could not load {name}: {error}
      </p>
    </div>
  );
}

function VercelProjects({ d }: { d: TrafficVercel }) {
  if (d.projects.length === 0) return <p className="panel-copy adm-muted">No projects found.</p>;
  return (
    <>
      {d.projects.map((p) => {
        if (p.error !== undefined) return <Failed key={p.name} name={p.name} error={p.error} />;
        const dates = p.daily.map((x) => x.date);
        return (
          <div className="adm-traffic-block" key={p.name} role="group" aria-label={p.name}>
            <h3 className="adm-traffic-name">{p.name}</h3>
            <div className="adm-tiles">
              <Tile label="Visitors" value={n(p.totals.visitors)} sub="unique, whole range" />
              <Tile label="Page views" value={n(p.totals.pageviews)} />
            </div>
            <div className="adm-grid2">
              <BarChart title={`${p.name} visitors per day`} days={dates} series={[{ key: "visitors", label: "Visitors", color: "var(--chrome)" }]} values={{ visitors: p.daily.map((x) => x.visitors) }} />
              <BarChart title={`${p.name} page views per day`} days={dates} series={[{ key: "pageviews", label: "Page views", color: "var(--sea)" }]} values={{ pageviews: p.daily.map((x) => x.pageviews) }} />
            </div>
            <div className="adm-toplists">
              <TopList title="Pages" rows={p.pages} name={(k) => k || "/"} />
              <TopList title="Referrers" rows={p.referrers} name={referrerLabel} />
              <TopList title="Countries" rows={p.countries} name={countryName} />
              <TopList title="Devices" rows={p.devices} name={deviceLabel} />
            </div>
          </div>
        );
      })}
    </>
  );
}

function RenderServices({ d, asked }: { d: TrafficRender; asked: number }) {
  return (
    <>
      {asked > d.days ? <p className="adm-note">Showing the last {d.days} days: Render keeps {d.days}.</p> : null}
      {d.services.length === 0 ? <p className="panel-copy adm-muted">No running services.</p> : null}
      {d.services.map((s) => {
        if (s.error !== undefined) return <Failed key={s.name} name={s.name} error={s.error} />;
        return (
          <div className="adm-traffic-block" key={s.name} role="group" aria-label={s.name}>
            <h3 className="adm-traffic-name">
              {s.name} <small>{s.type}</small>
            </h3>
            <div className="adm-tiles">
              <Tile label="Requests" value={n(s.requests)} sub={`${n(s.errors_4xx)} client errors (4xx)`} />
              <Tile label="Server errors" value={n(s.errors_5xx)} sub="5xx" />
              <Tile label="CPU, average" value={coresText(s.cpu_avg)} sub={`peak ${againstLimit(s.cpu_peak, s.cpu_limit, coresText)}`} />
              <Tile label="Memory, average" value={memoryText(s.memory_avg)} sub={`peak ${againstLimit(s.memory_peak, s.memory_limit, memoryText)}`} />
            </div>
            <BarChart
              title={`${s.name} requests per day`}
              days={s.requests_daily.map((x) => x.date)}
              series={[
                { key: "ok", label: "Requests", color: "var(--chrome)" },
                { key: "bad", label: "5xx errors", color: "var(--crimson-bright)" },
              ]}
              values={{ ok: s.requests_daily.map((x) => x.total - x.errors_5xx), bad: s.requests_daily.map((x) => x.errors_5xx) }}
            />
          </div>
        );
      })}
    </>
  );
}

export function TrafficTab({ data, days, onDaysChange, stale = false }: { data: AdminTraffic; days: RangeDays; onDaysChange: (days: RangeDays) => void; stale?: boolean }): ReactNode {
  return (
    <>
      <div className="adm-range-row">
        <span className="adm-range-label">Date range</span>
        <RangePicker value={days} onChange={onDaysChange} label="Date range in days" busy={stale} />
      </div>
      <div className={`adm-traffic${stale ? " adm-stale" : ""}`}>
        <Card<TrafficVercel> title="Site visits (Vercel Web Analytics)" result={data.vercel} hint="add VERCEL_TOKEN (+ VERCEL_TEAM_ID) to the optcg-api service on Render">
          {(d) => <VercelProjects d={d} />}
        </Card>
        <Card<TrafficRender> title="Server load (Render)" result={data.render} hint="add RENDER_API_KEY to the optcg-api service on Render">
          {(d) => <RenderServices d={d} asked={data.days} />}
        </Card>
      </div>
    </>
  );
}
