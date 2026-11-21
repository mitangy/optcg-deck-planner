import { useMemo } from "react";
import type { Card } from "../shared/data";

const TYPE_BAR: Record<string, string> = { character: "bg-sea", event: "bg-gold", stage: "bg-[#7a4aa8]" };

function Tile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-rule bg-paper-sunk p-3">
      <dt className="label-caps text-muted">{label}</dt>
      <dd className="mt-0.5 font-display text-2xl font-semibold text-sea-night tabular-nums">{value}</dd>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

export default function DeckStats({ cards }: { cards: Card[] }) {
  const s = useMemo(() => {
    const copies = cards.reduce((n, c) => n + (c.count ?? 0), 0);
    const byType: Record<string, number> = {};
    cards.forEach((c) => { byType[c.type ?? "other"] = (byType[c.type ?? "other"] ?? 0) + 1; });
    const counterSum = cards.reduce((n, c) => n + (c.counter ?? 0) * (c.count ?? 0), 0);
    const has = (c: Card, t: string) => c.text.includes(t);
    const sumBy = (f: (c: Card) => boolean) => cards.filter(f).reduce((n, c) => n + (c.count ?? 0), 0);
    const curve = Array.from({ length: 11 }, () => ({ character: 0, event: 0, stage: 0 }));
    cards.forEach((c) => { const k = Math.min(c.cost ?? 0, 10); const t = (c.type ?? "character") as "character"; if (curve[k][t] !== undefined) curve[k][t] += c.count ?? 0; });
    const peak = Math.max(1, ...curve.map((b) => b.character + b.event + b.stage));
    const ctr = {
      none: sumBy((c) => c.type !== "event" && !c.counter),
      k1: sumBy((c) => c.counter === 1000),
      k2: sumBy((c) => (c.counter ?? 0) >= 2000),
      ev: sumBy((c) => c.type === "event" && has(c, "[Counter]")),
    };
    return { copies, byType, avg: Math.round(counterSum / copies), trig: sumBy((c) => has(c, "[Trigger]")), block: sumBy((c) => has(c, "[Blocker]")), curve, peak, ctr };
  }, [cards]);
  const ctrTotal = s.ctr.none + s.ctr.k1 + s.ctr.k2 + s.ctr.ev || 1;
  const seg = (n: number, cls: string) => n > 0 && <div className={cls} style={{ width: `${(n / ctrTotal) * 100}%` }} />;
  const breakdown = (["character", "event", "stage"] as const).filter((t) => s.byType[t]).map((t) => `${s.byType[t]} ${{ character: "Char", event: "Event", stage: "Stage" }[t]}`).join(" · ");

  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-2.5">
        <Tile label="Cards" value={cards.length} sub={breakdown} />
        <Tile label="Avg counter" value={s.avg} sub="per copy" />
        <Tile label="Triggers" value={s.trig} />
        <Tile label="Blockers" value={s.block} />
      </dl>

      <section>
        <h3 className="label-caps text-gold-ink">Cost curve</h3>
        <ul className="mt-1 flex gap-3 text-xs text-muted">
          {Object.entries(TYPE_BAR).map(([t, cls]) => (
            <li key={t} className="flex items-center gap-1.5 capitalize"><span className={`size-2.5 rounded-sm ${cls}`} />{t}</li>
          ))}
        </ul>
        <div className="mt-2 flex h-28 items-end gap-1 border-b border-rule-strong">
          {s.curve.map((b, i) => {
            const total = b.character + b.event + b.stage;
            return (
              <div key={i} className="flex h-full min-w-0 flex-1 flex-col justify-end text-center" title={`Cost ${i}: ${total}`}>
                {total > 0 && <span className="text-[10px] text-muted tabular-nums">{total}</span>}
                <div className="flex w-full flex-col-reverse overflow-hidden rounded-t-sm" style={{ height: `${(total / s.peak) * 80}%` }}>
                  {(["character", "event", "stage"] as const).map((t) => b[t] > 0 && <div key={t} className={TYPE_BAR[t]} style={{ height: `${(b[t] / total) * 100}%` }} />)}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex gap-1 text-center text-[10px] text-muted tabular-nums">
          {s.curve.map((_, i) => <span key={i} className="min-w-0 flex-1">{i === 10 ? "10+" : i}</span>)}
        </div>
      </section>

      <section>
        <h3 className="label-caps text-gold-ink">Counters</h3>
        <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-parchment-deep">
          {seg(s.ctr.none, "bg-rule-strong")}{seg(s.ctr.k1, "bg-gold")}{seg(s.ctr.k2, "bg-gold-ink")}{seg(s.ctr.ev, "bg-sea")}
        </div>
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
          <span>No counter {s.ctr.none}</span><span>+1000 {s.ctr.k1}</span><span>+2000 {s.ctr.k2}</span><span>Counter events {s.ctr.ev}</span>
        </p>
      </section>
    </div>
  );
}
