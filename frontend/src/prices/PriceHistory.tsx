import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from "react";
import { Popover, PopoverButton, PopoverPanel } from "@optcg/ui/popups";
import { useLogPoseAsk } from "@optcg/analyst-client";
import { bestTimeToBuy, buyTiming, type BestBuy, type BuyTiming } from "@optcg/price-timing";
import { formatMoney, formatMoneyWhole } from "@optcg/card-core";
import { api, money, type PriceHistoryResponse } from "../api";
import {
  buyQuestion,
  buyTimingInput,
  DEFAULT_RANGE_ID,
  HISTORY_RANGES,
  dayNumber,
  formatDay,
  historyStats,
  nearestIndex,
  niceTicks,
  pointsInRange,
  rangeChangePct,
  releasedAgo,
  todayIso,
  toPoints,
  type PricePoint,
} from "./priceHistoryModel";
import { qk } from "../cache/queryKeys";
import { useLightboxPanel } from "./lightboxPanel";

// Chart geometry in viewBox units; the SVG scales to its box, so the aspect ratio (and height) never changes.
const W = 360;
const H = 168;
const PAD = { top: 10, right: 10, bottom: 22, left: 40 };

function pct(value: number | null): string {
  if (value == null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function tone(value: number | null): string {
  if (value == null || Math.abs(value) < 0.05) return "";
  return value > 0 ? "up" : "down";
}

function axisLabel(t: number): string {
  return t >= 100 || !(t % 1) ? formatMoneyWhole(t) : formatMoney(t);
}

function Stat({ label, value, sub, toneClass = "" }: { label: string; value: string; sub?: string; toneClass?: string }) {
  return (
    <div className="ph-stat">
      <dt>{label}</dt>
      <dd className={toneClass}>{value}</dd>
      <dd className="ph-stat-sub">{sub ?? " "}</dd>
    </div>
  );
}

/** " · est. $A–$B" for the best-time line; "~$A" when both ends round to the same dollar, empty without an estimate. */
function bestEstimate(best: BestBuy): string {
  if (best.estLow == null || best.estHigh == null) return "";
  const whole = Math.min(best.estLow, best.estHigh) >= 10;
  const fmt = (x: number) => (whole ? formatMoneyWhole(x) : formatMoney(x));
  const lo = fmt(best.estLow);
  const hi = fmt(best.estHigh);
  return lo === hi ? ` · est. ~${lo}` : ` · est. ${lo}–${hi}`;
}

const PILL: Record<BuyTiming["verdict"], string> = { wait: "Wait", soon: "Almost", good: "Good time", holds: "Holds", unknown: "No read" };

/**
 * The "?" next to the verdict. Hover (mouse) or keyboard focus shows the reasons in a floating panel anchored to the
 * icon; a click or tap pins it open (phones have no hover). Escape and a press outside close it. The panel floats in a
 * portal, so it never moves the chart or the lightbox it sits in.
 */
function WhyHint({ reasons }: { reasons: string[] }) {
  const [pinned, setPinned] = useState(false);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const leaveTimer = useRef<number | undefined>(undefined);
  const open = (pinned || hover || focus) && reasons.length > 0;
  const panelId = useId();
  const btnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);
  // PopoverButton sets aria-expanded from its own (click-only) state, which this hover/focus/tap panel does not use,
  // so mirror the real state onto the DOM; React never rewrites it because that prop never changes.
  useEffect(() => {
    btnRef.current?.setAttribute("aria-expanded", String(open));
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const closeAll = () => {
      setPinned(false);
      setHover(false);
      setFocus(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Only the hint closes, not the enlarged card around it.
      e.stopPropagation();
      closeAll();
    };
    const onDown = (e: Event) => {
      if (!(e.target as Element | null)?.closest?.("[data-why-hint]")) closeAll();
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [open]);
  const enter = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    window.clearTimeout(leaveTimer.current);
    setHover(true);
  };
  // A short grace period lets the pointer cross the gap between the icon and the panel.
  const leave = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => setHover(false), 150);
  };
  return (
    <Popover as="span" className="ph-buy-why-wrap">
      <PopoverButton
        ref={btnRef}
        type="button"
        className="ph-buy-why"
        aria-label="Why this read?"
        aria-controls={open ? panelId : undefined}
        disabled={reasons.length === 0}
        data-why-hint=""
        onClick={(e: React.MouseEvent) => {
          e.preventDefault();
          setPinned((v) => !v);
        }}
        onPointerEnter={enter}
        onPointerLeave={leave}
        onFocus={(e: React.FocusEvent<HTMLElement>) => setFocus(e.currentTarget.matches(":focus-visible"))}
        onBlur={() => setFocus(false)}
      >
        <span className="ph-buy-why-icon" aria-hidden="true">
          ?
        </span>
      </PopoverButton>
      {open ? (
        <PopoverPanel
          static
          anchor={{ to: "bottom end", gap: 6, padding: 8 }}
          id={panelId}
          role="tooltip"
          className="ph-why-panel"
          data-why-hint=""
          onPointerEnter={enter}
          onPointerLeave={leave}
        >
          <ul className="ph-buy-reasons">
            {reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p className="ph-why-note">Typical patterns of past sets, not a forecast.</p>
        </PopoverPanel>
      ) : null}
    </Popover>
  );
}

/**
 * "When to buy": a verdict from how similar cards moved after release, with the reasons one tap away. Its box is
 * the same size while loading, so the panel never jumps. `onAsk` is set only where Log Pose can answer.
 */
function WhenToBuy({ timing, best, loading, onAsk }: { timing: BuyTiming | null; best: BestBuy | null; loading: boolean; onAsk: (() => void) | null }) {
  const verdict = timing?.verdict ?? "unknown";
  const reasons = timing ? [...timing.reasons, ...(timing.seasonNote ? [timing.seasonNote] : []), ...(best ? [best.basis] : [])] : [];
  return (
    <div className="ph-buy" aria-label="When to buy" aria-busy={loading}>
      <div className="ph-buy-main">
        <span className={`ph-pill ph-pill-${loading ? "loading" : verdict}`}>{loading ? "…" : PILL[verdict]}</span>
        <span className="ph-buy-headline">{loading ? "Checking when to buy…" : (timing?.headline ?? "No read yet")}</span>
        <WhyHint reasons={loading ? [] : reasons} />
      </div>
      <div className="ph-buy-best">
        {loading ? (
          "Best time: …"
        ) : best ? (
          <>
            Best time: <strong>{best.label}</strong>
            {bestEstimate(best) ? <span className="ph-buy-est">{bestEstimate(best)}</span> : null}
          </>
        ) : (
          "Best time: not enough data"
        )}
      </div>
      <div className="ph-buy-foot">
        <p className="ph-buy-note">Based on how similar cards moved after release, 2024–2026</p>
        {onAsk ? (
          <button type="button" className="ph-buy-ask" onClick={onAsk}>
            Ask Log Pose
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Chart({ points, label }: { points: PricePoint[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gradId = useId();

  const geo = useMemo(() => {
    const prices = points.map((p) => p.price);
    const ticks = niceTicks(Math.min(...prices), Math.max(...prices));
    const lo = ticks[0];
    const hi = ticks[ticks.length - 1];
    const d0 = dayNumber(points[0].date);
    const d1 = dayNumber(points[points.length - 1].date);
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const x = (day: number) => PAD.left + (d1 === d0 ? innerW / 2 : ((day - d0) / (d1 - d0)) * innerW);
    const y = (price: number) => PAD.top + (hi === lo ? innerH / 2 : (1 - (price - lo) / (hi - lo)) * innerH);
    const coords = points.map((p) => [x(dayNumber(p.date)), y(p.price)] as const);
    return { ticks, y, d0, d1, coords, innerW };
  }, [points]);

  const line = geo.coords.map(([cx, cy], i) => `${i ? "L" : "M"}${cx.toFixed(1)} ${cy.toFixed(1)}`).join("");
  const baseY = H - PAD.bottom;
  const area = `${line}L${geo.coords[geo.coords.length - 1][0].toFixed(1)} ${baseY}L${geo.coords[0][0].toFixed(1)} ${baseY}Z`;

  function onMove(e: PointerEvent<SVGSVGElement>) {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const vx = ((e.clientX - box.left) / box.width) * W;
    const frac = Math.min(1, Math.max(0, (vx - PAD.left) / geo.innerW));
    setHover(nearestIndex(points, geo.d0 + frac * (geo.d1 - geo.d0)));
  }

  const hp = hover != null ? points[hover] : null;
  const [hx, hy] = hover != null ? geo.coords[hover] : [0, 0];

  return (
    <div className="ph-chart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={label}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setHover(null);
        }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.28" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {geo.ticks.map((t) => (
          <g key={t}>
            <line className="ph-grid" x1={PAD.left} x2={W - PAD.right} y1={geo.y(t)} y2={geo.y(t)} />
            <text className="ph-axis" x={PAD.left - 6} y={geo.y(t)} textAnchor="end" dominantBaseline="middle">
              {axisLabel(t)}
            </text>
          </g>
        ))}
        <path d={area} fill={`url(#${gradId})`} />
        <path className="ph-line" d={line} />
        <text className="ph-axis" x={PAD.left} y={H - 5} textAnchor="start">
          {formatDay(points[0].date)}
        </text>
        <text className="ph-axis" x={W - PAD.right} y={H - 5} textAnchor="end">
          {formatDay(points[points.length - 1].date)}
        </text>
        {hp ? (
          <g pointerEvents="none">
            <line className="ph-cross" x1={hx} x2={hx} y1={PAD.top} y2={baseY} />
            <circle className="ph-dot" cx={hx} cy={hy} r="4" />
          </g>
        ) : null}
      </svg>
      {hp ? (
        <div
          className="ph-tip"
          role="status"
          style={{
            left: `${(hx / W) * 100}%`,
            top: `${(hy / H) * 100}%`,
            transform: `translate(${hx / W > 0.6 ? "calc(-100% - 10px)" : "10px"}, ${hy / H > 0.5 ? "calc(-100% - 8px)" : "8px"})`,
          }}
        >
          <span>{formatDay(hp.date)}</span>
          <strong>{money(hp.price)}</strong>
        </div>
      ) : null}
    </div>
  );
}

/** Price history of one art: range buttons, whole-history stats and an SVG line chart. */
export function PriceHistory({ cardId, productId = 0 }: { cardId: string; productId?: number }) {
  const q = useQuery<PriceHistoryResponse>({
    queryKey: qk.priceHistory(cardId, productId),
    queryFn: () => api.priceHistory(cardId, productId),
    staleTime: 10 * 60_000,
    retry: false,
  });
  const [rangeId, setRangeId] = useState(DEFAULT_RANGE_ID);
  const range = HISTORY_RANGES.find((r) => r.id === rangeId) ?? HISTORY_RANGES[1];

  const all = useMemo(() => toPoints(q.data?.points ?? []), [q.data]);
  const shown = useMemo(() => pointsInRange(all, range), [all, range]);
  const stats = useMemo(() => historyStats(all, q.data?.current ?? null), [all, q.data]);
  const change = rangeChangePct(shown);
  const released = q.data?.released ?? null;
  const fromPeak = stats.changeFromPeakPct;

  const [timing, best] = useMemo(() => {
    if (!q.data) return [null, null] as const;
    const input = buyTimingInput(q.data, all, stats.now, todayIso());
    return [buyTiming(input), bestTimeToBuy(input)] as const;
  }, [q.data, all, stats.now]);
  const askLogPose = useLogPoseAsk();
  const data = q.data;
  const ask =
    askLogPose && data
      ? () => {
          askLogPose({ prompt: buyQuestion(data.name, cardId, productId) });
        }
      : null;

  const status = q.isPending ? "loading" : q.isError ? "error" : shown.length === 0 ? "empty" : "ready";
  const name = q.data?.name ?? "this art";

  return (
    <section className="ph" aria-label="Price history">
      <div className="ph-head">
        <div className="ph-title" title={q.data?.name}>
          {q.data?.name ?? "Price history"}
        </div>
        <div className="ph-ranges" role="group" aria-label="Range">
          {HISTORY_RANGES.map((r) => (
            <button key={r.id} type="button" aria-pressed={r.id === rangeId} onClick={() => setRangeId(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <dl className="ph-stats" aria-label="Price stats" aria-busy={q.isPending}>
        <Stat label="Now" value={money(stats.now)} />
        <Stat label="Peak" value={money(stats.peak?.price)} sub={stats.peak ? formatDay(stats.peak.date) : undefined} />
        <Stat label="Low since peak" value={money(stats.lowSincePeak)} />
        <Stat label="From peak" value={pct(fromPeak)} toneClass={tone(fromPeak)} />
        <Stat
          label="Released"
          value={released ? formatDay(released).replace(/, 20(\d\d)$/, " '$1") : "—"}
          sub={released ? releasedAgo(released, todayIso()) : undefined}
        />
        <Stat label={`${range.label} change`} value={pct(change)} toneClass={tone(change)} />
      </dl>
      <WhenToBuy timing={timing} best={best} loading={q.isPending} onAsk={ask} />
      <div className={`ph-body ph-${status}`}>
        {status === "ready" ? (
          <Chart
            key={`${rangeId}-${shown.length}`}
            points={shown}
            label={`${name} market price from ${formatDay(shown[0].date)} to ${formatDay(shown[shown.length - 1].date)}`}
          />
        ) : (
          <div className="ph-placeholder" role={status === "loading" ? "status" : undefined}>
            {status === "loading"
              ? "Loading price history…"
              : status === "error"
                ? "Could not load price history"
                : "No price history yet for this art"}
          </div>
        )}
      </div>
    </section>
  );
}

/** The lightbox button; the panel floats over the art, so opening it never moves the button. */
export function LightboxPriceHistoryControl({ cardId, productId = 0 }: { cardId: string; productId?: number }) {
  const [open, setOpen] = useLightboxPanel("history");
  return (
    <div className="lightbox-history">
      <button type="button" className="btn secondary lightbox-history-btn" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        Price history
      </button>
      {open ? (
        <div className="lightbox-history-pop">
          <PriceHistory cardId={cardId} productId={productId} />
        </div>
      ) : null}
    </div>
  );
}
