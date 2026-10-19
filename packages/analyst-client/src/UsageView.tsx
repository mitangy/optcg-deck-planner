import { useEffect, useState } from "react";
import { formatUsd } from "./credit";
import { fetchUsageSummary, type UsageSummary } from "./usage";
import { modelLabel } from "./modelSetting";

function dayText(iso: string | null): string {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "never";
}

/** Owners: what Log Pose has cost, in total and per player, kind and model. */
export function UsageView({ apiBase }: { apiBase: string }) {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchUsageSummary(apiBase).then(
      (u) => live && setUsage(u),
      (e: unknown) => live && setError(e instanceof Error ? e.message : "Could not load usage."),
    );
    return () => {
      live = false;
    };
  }, [apiBase]);

  if (error) {
    return (
      <p className="lp-error" role="alert">
        {error}
      </p>
    );
  }
  if (!usage) return <p className="lp-note">Loading usage…</p>;

  return (
    <div className="lp-usage">
      <dl className="lp-usage-tiles">
        {(
          [
            ["Today", usage.todayUsd],
            ["This month", usage.monthUsd],
            ["All time", usage.totalUsd],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="lp-usage-tile">
            <dt>{label}</dt>
            <dd>{formatUsd(value)}</dd>
          </div>
        ))}
      </dl>

      <h3 className="lp-usage-heading">Players</h3>
      {usage.players.length === 0 ? <p className="lp-note">No usage yet.</p> : null}
      <ul className="lp-usage-list">
        {usage.players.map((p) => (
          <li key={p.userId} className="lp-usage-row">
            <div className="lp-usage-line">
              <span className="lp-usage-name">{p.name}</span>
              <span className="lp-usage-money">{formatUsd(p.spentUsd)}</span>
            </div>
            {p.creditUsd !== null ? (
              <div className="lp-usage-credit">
                <span className="lp-credit-bar" aria-hidden="true">
                  <span style={{ width: `${Math.min(100, (p.creditSpentUsd / Math.max(p.creditUsd, 0.01)) * 100)}%` }} />
                </span>
                <span>
                  {formatUsd(p.creditSpentUsd)} of {formatUsd(p.creditUsd)} this month
                </span>
              </div>
            ) : (
              <div className="lp-usage-credit">
                <span>Owner, no credit limit</span>
              </div>
            )}
            <p className="lp-usage-meta">
              {p.threads} thread{p.threads === 1 ? "" : "s"} · {p.questions} question{p.questions === 1 ? "" : "s"}
              {p.refused ? ` · ${p.refused} refused` : ""} · last used {dayText(p.lastUsed)}
            </p>
          </li>
        ))}
      </ul>

      <h3 className="lp-usage-heading">Kind and model</h3>
      <ul className="lp-usage-list">
        {usage.groups.map((g) => (
          <li key={`${g.kind}:${g.model}`} className="lp-usage-row">
            <div className="lp-usage-line">
              <span className="lp-usage-name">
                {g.kind} · {g.model === "unknown" ? "unknown model" : modelLabel(g.model)}
              </span>
              <span className="lp-usage-money">{formatUsd(g.costUsd)}</span>
            </div>
            <p className="lp-usage-meta">{g.requests} request{g.requests === 1 ? "" : "s"}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
