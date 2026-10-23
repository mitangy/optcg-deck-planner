import type { ReactNode } from "react";

export function Tile({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="adm-tile">
      <span className="adm-tile-label">{label}</span>
      <span className="adm-tile-value">{value}</span>
      {sub != null ? <span className="adm-tile-sub">{sub}</span> : null}
    </div>
  );
}

export type Series = { key: string; label: string; color: string };

/**
 * Stacked daily bars as inline SVG. Bars are drawn in a fixed 0..100 box that stretches to the container;
 * labels live in HTML so they never distort. `marker` is an optional day index to flag with a vertical line.
 */
export function BarChart({
  days,
  series,
  values,
  height = 120,
  markerIndex,
  markerLabel,
  title,
}: {
  days: string[];
  series: Series[];
  values: Record<string, number[]>;
  height?: number;
  markerIndex?: number | null;
  markerLabel?: string;
  title: string;
}) {
  const n = days.length;
  const totals = days.map((_, i) => series.reduce((s, x) => s + (values[x.key]?.[i] ?? 0), 0));
  const max = Math.max(1, ...totals);
  const slot = 100 / Math.max(n, 1);
  const bw = slot * 0.7;
  return (
    <figure className="adm-chart" aria-label={title}>
      <div className="adm-chart-plot" style={{ height }}>
        <span className="adm-chart-max">{max}</span>
        <div className="adm-chart-area">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={title}>
          <line x1="0" y1="99.5" x2="100" y2="99.5" className="adm-axis" vectorEffect="non-scaling-stroke" />
          {days.map((d, i) => {
            let y = 100;
            return (
              <g key={d}>
                <title>{`${d}: ${series.map((s) => `${values[s.key]?.[i] ?? 0} ${s.label.toLowerCase()}`).join(", ")}`}</title>
                {series.map((s) => {
                  const v = values[s.key]?.[i] ?? 0;
                  const h = (v / max) * 98;
                  y -= h;
                  return h > 0 ? <rect key={s.key} x={i * slot + (slot - bw) / 2} y={y} width={bw} height={h} fill={s.color} /> : null;
                })}
              </g>
            );
          })}
          {markerIndex != null && markerIndex >= 0 && markerIndex < n ? (
            <line x1={markerIndex * slot + slot / 2} x2={markerIndex * slot + slot / 2} y1="0" y2="100" className="adm-marker" vectorEffect="non-scaling-stroke" />
          ) : null}
        </svg>
        </div>
      </div>
      <div className="adm-chart-days" aria-hidden>
        <span>{days[0]?.slice(5)}</span>
        {markerLabel ? <span className="adm-chart-flag">{markerLabel}</span> : null}
        <span>{days[n - 1]?.slice(5)}</span>
      </div>
      {series.length > 1 || markerLabel ? (
        <figcaption className="adm-legend">
          {series.map((s) => (
            <span key={s.key} className="adm-legend-item">
              <i style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
          {markerLabel ? (
            <span className="adm-legend-item">
              <i className="adm-legend-line" />
              {markerLabel}
            </span>
          ) : null}
        </figcaption>
      ) : null}
    </figure>
  );
}

/** Score % over time: one point per run on a time axis, with an optional vertical marker at `markerAt`. */
export function ScoreChart({ points, markerAt, markerLabel }: { points: { at: number; pct: number; label: string }[]; markerAt: number | null; markerLabel: string }) {
  if (points.length === 0) return <p className="panel-copy adm-muted">No eval runs recorded yet.</p>;
  const times = [...points.map((p) => p.at), ...(markerAt != null ? [markerAt] : [])];
  const lo = Math.min(...times);
  const span = Math.max(Math.max(...times) - lo, 1);
  const pad = 6;
  const x = (t: number) => pad + ((t - lo) / span) * (100 - 2 * pad);
  const floor = Math.min(...points.map((p) => p.pct));
  // Zoom the Y axis to the data, 10-point steps, so a few points of change are visible.
  const yMin = Math.max(0, Math.floor((floor - 5) / 10) * 10);
  const yScale = (p: number) => ((p - yMin) / (100 - yMin)) * 88 + 6;
  const poly = points.map((p) => `${x(p.at)},${100 - yScale(p.pct)}`).join(" ");
  return (
    <figure className="adm-chart" aria-label="Eval score over time">
      <div className="adm-chart-plot adm-score-plot" style={{ height: 150 }}>
        <span className="adm-chart-max">100%</span>
        <span className="adm-chart-min">{yMin}%</span>
        <div className="adm-chart-area">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Eval score over time">
          <line x1="0" y1="99.5" x2="100" y2="99.5" className="adm-axis" vectorEffect="non-scaling-stroke" />
          {markerAt != null ? <line x1={x(markerAt)} x2={x(markerAt)} y1="0" y2="100" className="adm-marker" vectorEffect="non-scaling-stroke" /> : null}
          {points.length > 1 ? <polyline points={poly} className="adm-line" vectorEffect="non-scaling-stroke" /> : null}
        </svg>
        {points.map((p) => (
          <span key={p.at} className={`adm-dot${x(p.at) > 70 ? " flip" : ""}`} style={{ left: `${x(p.at)}%`, bottom: `${yScale(p.pct)}%` }} title={`${p.label}: ${p.pct.toFixed(1)}%`}>
            <b>{p.pct.toFixed(1)}%</b>
          </span>
        ))}
        </div>
      </div>
      <figcaption className="adm-legend">
        <span className="adm-legend-item">
          <i style={{ background: "var(--chrome)" }} />
          Eval score
        </span>
        {markerAt != null ? (
          <span className="adm-legend-item">
            <i className="adm-legend-line" />
            {markerLabel}
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}
