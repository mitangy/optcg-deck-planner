import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { Card } from "../shared/data";

const config = {
  character: { label: "Character", color: "var(--chart-1)" },
  event: { label: "Event", color: "var(--chart-2)" },
  stage: { label: "Stage", color: "var(--chart-3)" },
} satisfies ChartConfig;

function Tile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="min-w-0 rounded-lg border bg-muted/50 p-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-heading text-2xl font-semibold tabular-nums">{value}</dd>
      {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
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
    const curve = Array.from({ length: 11 }, (_, i) => ({ cost: i === 10 ? "10+" : String(i), character: 0, event: 0, stage: 0 }));
    cards.forEach((c) => {
      const k = Math.min(c.cost ?? 0, 10);
      const t = (c.type ?? "character") as "character" | "event" | "stage";
      if (t in config) curve[k][t] += c.count ?? 0;
    });
    const ctr = {
      none: sumBy((c) => c.type !== "event" && !c.counter),
      k1: sumBy((c) => c.counter === 1000),
      k2: sumBy((c) => (c.counter ?? 0) >= 2000),
      ev: sumBy((c) => c.type === "event" && has(c, "[Counter]")),
    };
    return { copies, byType, avg: Math.round(counterSum / copies), trig: sumBy((c) => has(c, "[Trigger]")), block: sumBy((c) => has(c, "[Blocker]")), curve, ctr };
  }, [cards]);
  const ctrTotal = s.ctr.none + s.ctr.k1 + s.ctr.k2 + s.ctr.ev || 1;
  const segs = [
    { label: "No counter", n: s.ctr.none, color: "var(--muted-foreground)" },
    { label: "+1000", n: s.ctr.k1, color: "var(--chart-2)" },
    { label: "+2000", n: s.ctr.k2, color: "var(--chart-5)" },
    { label: "Counter events", n: s.ctr.ev, color: "var(--chart-1)" },
  ];
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
        <h3 className="text-sm font-medium">Cost curve</h3>
        <ChartContainer config={config} className="mt-2 aspect-auto h-40 w-full">
          <BarChart data={s.curve} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="cost" tickLine={false} axisLine={false} tickMargin={6} interval={0} fontSize={10} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <Bar dataKey="character" stackId="a" fill="var(--color-character)" />
            <Bar dataKey="event" stackId="a" fill="var(--color-event)" />
            <Bar dataKey="stage" stackId="a" fill="var(--color-stage)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartContainer>
        <ul className="mt-1 flex justify-center gap-4 text-xs text-muted-foreground">
          {Object.entries(config).map(([k, v]) => (
            <li key={k} className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: v.color }} />{v.label}</li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="text-sm font-medium">Counters</h3>
        <div className="mt-2 flex h-3 gap-px overflow-hidden rounded-full bg-muted">
          {segs.map((g) => g.n > 0 && <div key={g.label} style={{ width: `${(g.n / ctrTotal) * 100}%`, background: g.color }} />)}
        </div>
        <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {segs.map((g) => (
            <li key={g.label} className="flex items-center gap-1.5"><span className="size-2 shrink-0 rounded-full" style={{ background: g.color }} />{g.label} <span className="ml-auto font-medium text-foreground tabular-nums">{g.n}</span></li>
          ))}
        </ul>
      </section>
    </div>
  );
}
