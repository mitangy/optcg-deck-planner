import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { RANGE_OPTIONS, type RangeDays, tipPlacement, tooltipFor, tooltipText, toggleSeries, visibleMax, visibleTotals } from "./adminLogic";

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

/** The 7 / 14 / 30 / 90 day switch. Its size never depends on loading, so a refetch does not move it. */
export function RangePicker({ value, onChange, label, busy }: { value: number; onChange: (days: RangeDays) => void; label: string; busy?: boolean }) {
  return (
    <div className="adm-range" role="group" aria-label={label} aria-busy={busy || undefined}>
      {RANGE_OPTIONS.map((d) => (
        <button key={d} type="button" className="adm-range-btn" aria-pressed={value === d} onClick={() => d !== value && onChange(d)}>
          {d}
          <span className="adm-range-unit">d</span>
        </button>
      ))}
    </div>
  );
}

/** A floating box over a chart. It is absolutely positioned and never takes part in layout. */
function Tip({ xPct, yPct, children }: { xPct: number; yPct?: number; children: ReactNode }) {
  const p = tipPlacement(xPct, yPct);
  const style =
    p.h === "left" ? { left: `${xPct}%` } : p.h === "right" ? { right: `${100 - xPct}%` } : { left: `${xPct}%`, transform: "translateX(-50%)" };
  const vertical = yPct === undefined ? { top: 4 } : p.v === "above" ? { bottom: `calc(${yPct}% + 16px)` } : { top: `calc(${100 - yPct}% + 16px)` };
  return (
    <div className="adm-tip" style={{ ...style, ...vertical }} aria-hidden>
      {children}
    </div>
  );
}

/**
 * Stacked daily bars as inline SVG. Bars are drawn in a fixed 0..100 box that stretches to the container;
 * labels live in HTML so they never distort. `marker` is an optional day index to flag with a vertical line.
 * Hovering, tapping or arrowing to a day shows its counts in a tooltip; the legend turns series on and off, and the
 * scale follows the series still shown. With `onSelectDay`, picking a day (click, tap, Enter) reports it.
 */
export function BarChart({
  days,
  series,
  values,
  height = 120,
  markerIndex,
  markerLabel,
  title,
  selectedDay,
  onSelectDay,
}: {
  days: string[];
  series: Series[];
  values: Record<string, number[]>;
  height?: number;
  markerIndex?: number | null;
  markerLabel?: string;
  title: string;
  selectedDay?: string | null;
  onSelectDay?: (day: string) => void;
}) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [active, setActive] = useState<number | null>(null);
  const figure = useRef<HTMLElement>(null);
  const n = days.length;
  const shown = series.filter((s) => !hidden.has(s.key));
  const totals = visibleTotals(n, series, values, hidden);
  const max = visibleMax(totals);
  const slot = 100 / Math.max(n, 1);
  const bw = slot * 0.7;
  const at = active !== null && active < n ? active : null;
  const tip = at !== null ? tooltipFor(days[at]!, at, series, values, hidden) : null;
  const selected = selectedDay ? days.indexOf(selectedDay) : -1;

  // A tap on a phone leaves the tooltip up; a tap anywhere else, or Escape, puts it away.
  useEffect(() => {
    if (at === null) return;
    const away = (e: PointerEvent) => {
      if (!figure.current?.contains(e.target as Node)) setActive(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [at]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const last = n - 1;
    const cur = at ?? (e.key === "ArrowLeft" ? n : -1);
    if (e.key === "ArrowRight") setActive(Math.min(cur + 1, last));
    else if (e.key === "ArrowLeft") setActive(Math.max(cur - 1, 0));
    else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(last);
    else if (e.key === "Escape") setActive(null);
    else if ((e.key === "Enter" || e.key === " ") && at !== null && onSelectDay) onSelectDay(days[at]!);
    else return;
    e.preventDefault();
  }

  return (
    <figure className="adm-chart" aria-label={title} ref={figure}>
      <div className="adm-chart-plot" style={{ height }}>
        <span className="adm-chart-max">{max}</span>
        <div
          className="adm-chart-area adm-bars"
          tabIndex={0}
          role="group"
          aria-label={`${title}: arrow keys move between days${onSelectDay ? ", Enter shows that day's matches" : ""}`}
          onKeyDown={onKeyDown}
          onFocus={(e) => {
            let keyboard = false;
            try {
              keyboard = e.currentTarget.matches(":focus-visible");
            } catch {
              /* selector not supported */
            }
            if (keyboard && active === null && n > 0) setActive(n - 1);
          }}
          onBlur={() => setActive(null)}
          onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}
        >
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={title}>
            <line x1="0" y1="99.5" x2="100" y2="99.5" className="adm-axis" vectorEffect="non-scaling-stroke" />
            {selected >= 0 ? <rect x={selected * slot} y="0" width={slot} height="100" className="adm-bar-sel" /> : null}
            {at !== null ? <rect x={at * slot} y="0" width={slot} height="100" className="adm-bar-hl" /> : null}
            {days.map((d, i) => {
              let y = 100;
              return (
                <g key={d}>
                  <title>{tooltipText(d, tooltipFor(d, i, series, values, hidden))}</title>
                  {shown.map((s) => {
                    const v = values[s.key]?.[i] ?? 0;
                    const h = (v / max) * 98;
                    y -= h;
                    return h > 0 ? <rect key={s.key} className="adm-bar" data-series={s.key} x={i * slot + (slot - bw) / 2} y={y} width={bw} height={h} fill={s.color} /> : null;
                  })}
                </g>
              );
            })}
            {markerIndex != null && markerIndex >= 0 && markerIndex < n ? (
              <line x1={markerIndex * slot + slot / 2} x2={markerIndex * slot + slot / 2} y1="0" y2="100" className="adm-marker" vectorEffect="non-scaling-stroke" />
            ) : null}
          </svg>
          <div className={`adm-bar-hits${onSelectDay ? " pick" : ""}`} aria-hidden>
            {days.map((d, i) => (
              <span
                key={d}
                className="adm-bar-hit"
                data-day={d}
                onPointerEnter={(e) => e.pointerType !== "touch" && setActive(i)}
                onClick={() => {
                  setActive(i);
                  onSelectDay?.(d);
                }}
              />
            ))}
          </div>
          {tip && at !== null ? (
            <Tip xPct={(at + 0.5) * slot}>
              <b>{tip.title}</b>
              {tip.rows.map((r) => (
                <span key={r.key} className="adm-tip-row">
                  <i style={{ background: series.find((s) => s.key === r.key)?.color }} />
                  {r.label}
                  <em>{r.value}</em>
                </span>
              ))}
              {tip.rows.length > 1 ? (
                <span className="adm-tip-row adm-tip-total">
                  Total<em>{tip.total}</em>
                </span>
              ) : null}
            </Tip>
          ) : null}
        </div>
      </div>
      <div className="adm-sr" role="status" aria-live="polite">
        {tip && at !== null ? tooltipText(days[at]!, tip) : ""}
      </div>
      <div className="adm-chart-days" aria-hidden>
        <span>{days[0]?.slice(5)}</span>
        {markerLabel ? <span className="adm-chart-flag">{markerLabel}</span> : null}
        <span>{days[n - 1]?.slice(5)}</span>
      </div>
      {series.length > 1 || markerLabel ? (
        <figcaption className="adm-legend">
          {series.map((s) =>
            series.length > 1 ? (
              <button
                key={s.key}
                type="button"
                className="adm-legend-item adm-legend-btn"
                aria-pressed={!hidden.has(s.key)}
                aria-disabled={!hidden.has(s.key) && shown.length === 1 ? true : undefined}
                title={!hidden.has(s.key) && shown.length === 1 ? "At least one series stays on" : undefined}
                onClick={() => setHidden(toggleSeries(hidden, s.key, series.map((x) => x.key)))}
              >
                <i style={{ background: s.color }} />
                {s.label}
              </button>
            ) : (
              <span key={s.key} className="adm-legend-item">
                <i style={{ background: s.color }} />
                {s.label}
              </span>
            ),
          )}
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

export type TrendPoint = {
  at: number;
  value: number;
  label: string;
  /** The id of this run's row in the table below, so the dot can jump to it. */
  id: string;
  /** UTC date of the run, "2026-10-19". */
  date: string;
  spend: number | null;
};

/**
 * One value per run over time on a time axis, with an optional vertical marker at `markerAt`. `scale` is the Y range
 * and `format` writes a value for the axis, the dots and the tooltips (a score is "87.0%", a metric "0.85").
 * Each dot is a button: hovering or focusing it shows the run, and `onSelectPoint` fires when it is picked.
 */
export function TrendChart({
  points,
  scale,
  format,
  name,
  markerAt,
  markerLabel,
  hint,
  onSelectPoint,
}: {
  points: TrendPoint[];
  scale: { min: number; max: number };
  format: (value: number) => string;
  name: string;
  markerAt: number | null;
  markerLabel: string;
  hint?: string;
  onSelectPoint?: (id: string) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  if (points.length === 0) return <p className="panel-copy adm-muted">No eval runs recorded yet.</p>;
  const times = [...points.map((p) => p.at), ...(markerAt != null ? [markerAt] : [])];
  const lo = Math.min(...times);
  const span = Math.max(Math.max(...times) - lo, 1);
  const pad = 6;
  const x = (t: number) => pad + ((t - lo) / span) * (100 - 2 * pad);
  const yMin = scale.min;
  const yScale = (p: number) => ((Math.min(Math.max(p, yMin), scale.max) - yMin) / Math.max(scale.max - yMin, 1e-9)) * 88 + 6;
  const poly = points.map((p) => `${x(p.at)},${100 - yScale(p.value)}`).join(" ");
  const tip = points.find((p) => p.id === activeId) ?? null;
  return (
    <figure className="adm-chart" aria-label={`${name} over time`}>
      <div className="adm-chart-plot adm-score-plot" style={{ height: 150 }}>
        <span className="adm-chart-max">{format(scale.max)}</span>
        <span className="adm-chart-min">{format(yMin)}</span>
        <div className="adm-chart-area">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`${name} over time`}>
          <line x1="0" y1="99.5" x2="100" y2="99.5" className="adm-axis" vectorEffect="non-scaling-stroke" />
          {markerAt != null ? <line x1={x(markerAt)} x2={x(markerAt)} y1="0" y2="100" className="adm-marker" vectorEffect="non-scaling-stroke" /> : null}
          {points.length > 1 ? <polyline points={poly} className="adm-line" vectorEffect="non-scaling-stroke" /> : null}
        </svg>
        {points.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`adm-dot${x(p.at) > 70 ? " flip" : ""}${p.id === activeId ? " on" : ""}`}
            style={{ left: `${x(p.at)}%`, bottom: `${yScale(p.value)}%` }}
            data-run={p.id}
            aria-label={`${p.label}, ${p.date}, ${format(p.value)}${p.spend != null ? `, spend $${p.spend.toFixed(2)}` : ""}. Show in the table`}
            onClick={() => onSelectPoint?.(p.id)}
            onPointerEnter={(e) => e.pointerType !== "touch" && setActiveId(p.id)}
            onPointerLeave={() => setActiveId((cur) => (cur === p.id ? null : cur))}
            onFocus={() => setActiveId(p.id)}
            onBlur={() => setActiveId((cur) => (cur === p.id ? null : cur))}
          >
            <b>{format(p.value)}</b>
          </button>
        ))}
        {tip ? (
          <Tip xPct={x(tip.at)} yPct={yScale(tip.value)}>
            <b>{tip.label}</b>
            <span className="adm-tip-row">
              {tip.date}
            </span>
            <span className="adm-tip-row">
              {name}
              <em>{format(tip.value)}</em>
            </span>
            <span className="adm-tip-row">
              Spend<em>{tip.spend == null ? "—" : `$${tip.spend.toFixed(2)}`}</em>
            </span>
          </Tip>
        ) : null}
        </div>
      </div>
      <figcaption className="adm-legend">
        <span className="adm-legend-item">
          <i style={{ background: "var(--chrome)" }} />
          {name}
          {hint ? ` (${hint})` : ""}
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
