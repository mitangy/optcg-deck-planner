import { Listbox, ListboxButton, ListboxOption, ListboxOptions, Tab, TabGroup, TabList } from "@headlessui/react";
import { useMemo, useState } from "react";
import { collection } from "../shared/data";
import { COLOR_NAMES, ColorChip, CostChip, Page, PricePopover, TypeChip, money } from "./parts";

const TYPES = ["all", "leader", "character", "event", "stage"];
const SORTS = ["Value", "Copies", "Cost", "Name"] as const;
const dot: Record<string, string> = { red: "bg-[#c0392f]", green: "bg-[#2f8a55]", blue: "bg-[#2b72b8]", purple: "bg-[#7a4aa8]", black: "bg-[#22282c]", yellow: "bg-[#e2b020]" };

export default function PlannerCollection() {
  const [q, setQ] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [type, setType] = useState("all");
  const [view, setView] = useState(1);
  const [sort, setSort] = useState<(typeof SORTS)[number]>("Value");

  const stats = useMemo(() => ({
    unique: collection.length,
    copies: collection.reduce((n, c) => n + (c.owned ?? 0), 0),
    value: collection.reduce((n, c) => n + (c.owned ?? 0) * (c.price ?? 0), 0),
  }), []);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const v = (c: (typeof collection)[number]) => (c.owned ?? 0) * (c.price ?? 0);
    return collection
      .filter((c) => (!t || c.name.toLowerCase().includes(t) || c.id.toLowerCase().includes(t)) && (!color || c.colors.includes(color)) && (type === "all" || c.type === type))
      .sort((a, b) => sort === "Value" ? v(b) - v(a) : sort === "Copies" ? (b.owned ?? 0) - (a.owned ?? 0) : sort === "Cost" ? (a.cost ?? 0) - (b.cost ?? 0) : a.name.localeCompare(b.name));
  }, [q, color, type, sort]);

  const Stat = ({ label, value, gold }: { label: string; value: string | number; gold?: boolean }) => (
    <div className="min-w-0 flex-1 px-4 py-3 sm:px-6 sm:py-4">
      <dt className="label-caps text-muted">{label}</dt>
      <dd className={`mt-0.5 font-display text-2xl font-semibold tabular-nums sm:text-3xl ${gold ? "text-gold-ink" : "text-sea-night"}`}>{value}</dd>
    </div>
  );

  return (
    <Page active="Collection">
      <p className="label-caps text-gold-ink">Cards you own</p>
      <h1 className="font-display text-4xl font-semibold text-sea-night">Collection</h1>

      <dl className="panel-paper mt-4 flex divide-x divide-rule">
        <Stat label="Unique" value={stats.unique} />
        <Stat label="Copies" value={stats.copies} />
        <Stat label="Est. value" value={money(stats.value)} gold />
      </dl>

      <section className="mt-5 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, ID…" aria-label="Search collection" className="planner-field min-w-0 flex-1 basis-full sm:basis-64" />
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Colour">
          {COLOR_NAMES.map((c) => (
            <button key={c} type="button" aria-pressed={color === c} aria-label={c} onClick={() => setColor(color === c ? null : c)}
              className={`grid size-8 place-items-center rounded-full border transition aria-pressed:border-gold aria-pressed:bg-gold-soft aria-pressed:ring-2 aria-pressed:ring-gold/50 border-rule-strong bg-paper hover:border-gold`}>
              <span className={`size-4 rounded-full ring-1 ring-black/20 ${dot[c]}`} />
            </button>
          ))}
        </div>
      </section>

      <section className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-wrap gap-1.5" role="group" aria-label="Type">
          {TYPES.map((t) => (
            <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)}
              className="rounded-full border border-rule-strong bg-paper px-3 py-1 text-sm font-medium capitalize text-ink transition hover:border-gold aria-pressed:border-sea aria-pressed:bg-sea aria-pressed:text-[#fffaf0]">
              {t === "all" ? "All types" : t}
            </button>
          ))}
        </div>
        <Listbox value={sort} onChange={setSort}>
          <div className="relative ml-auto">
            <ListboxButton className="btn-paper h-[34px] gap-2"><span className="text-muted">Sort</span> {sort}
              <svg viewBox="0 0 10 6" className="w-2 fill-current text-muted"><path d="M0 0h10L5 6z" /></svg>
            </ListboxButton>
            <ListboxOptions anchor="bottom end" className="planner-menu w-44">
              {SORTS.map((s) => <ListboxOption key={s} value={s} className="planner-menu-item data-selected:font-semibold">{s}</ListboxOption>)}
            </ListboxOptions>
          </div>
        </Listbox>
        <TabGroup selectedIndex={view} onChange={setView}>
          <TabList className="inline-flex rounded-full border border-rule-strong bg-parchment-deep/70 p-0.5">
            {["List", "Grid"].map((t) => (
              <Tab key={t} className="rounded-full px-3.5 py-1 text-sm font-semibold text-muted outline-none transition data-hover:text-ink data-selected:bg-paper data-selected:text-sea data-selected:shadow-sm data-focus:outline-2 data-focus:outline-sea">{t}</Tab>
            ))}
          </TabList>
        </TabGroup>
      </section>

      <p className="mt-5 mb-2.5 text-sm text-muted">{rows.length} of {collection.length} cards</p>

      {rows.length === 0 ? (
        <p className="panel-paper p-8 text-center text-muted">No owned cards match those filters.</p>
      ) : view === 0 ? (
        <div className="panel-paper overflow-hidden">
          <div className="hidden grid-cols-[minmax(0,1fr)_100px_90px_100px_70px] gap-x-4 border-b border-rule bg-paper-sunk px-4 py-2.5 label-caps text-muted md:grid">
            <span>Card</span><span>Type · Cost</span><span>Owned</span><span>Value</span><span className="text-right">Market</span>
          </div>
          <ul className="divide-y divide-rule">
            {rows.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3 sm:px-4 md:grid md:grid-cols-[minmax(0,1fr)_100px_90px_100px_70px] md:gap-x-4">
                <div className="flex min-w-0 basis-full items-center gap-3 md:basis-auto">
                  <img src={c.image} alt="" loading="eager" className="h-[70px] w-[50px] shrink-0 rounded-md border border-sea-night/30 object-cover" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{c.name}</p>
                    <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted tabular-nums">{c.id}{c.colors.map((x) => <ColorChip key={x} color={x} />)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5"><TypeChip type={c.type} />{c.type !== "leader" && <CostChip cost={c.cost} />}</div>
                <span className="inline-flex w-fit rounded-full bg-sea px-2.5 py-0.5 text-xs font-bold text-[#fffaf0] tabular-nums">×{c.owned}</span>
                <span className="font-display text-base font-semibold text-gold-ink tabular-nums">{money((c.owned ?? 0) * (c.price ?? 0))}</span>
                <PricePopover price={c.price ?? 0} className="ml-auto md:ml-0 md:justify-self-end" />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {rows.map((c) => (
            <li key={c.id} className="panel-paper group flex min-w-0 flex-col p-2 transition hover:-translate-y-0.5 hover:shadow-lift">
              <div className="relative">
                <img src={c.image} alt={c.name} loading="eager" className="aspect-[5/7] w-full rounded-md border border-sea-night/30 object-cover" />
                <span className="absolute -top-1.5 -right-1.5 grid min-w-7 place-items-center rounded-full border-2 border-paper bg-sea px-1.5 py-0.5 text-xs font-bold text-[#fffaf0] tabular-nums shadow-sm">×{c.owned}</span>
                {c.type !== "leader" && <span className="absolute bottom-1.5 left-1.5"><CostChip cost={c.cost} /></span>}
              </div>
              <p className="mt-2 truncate text-[13px] font-semibold" title={c.name}>{c.name}</p>
              <div className="mt-0.5 flex items-center justify-between gap-1">
                <span className="truncate text-[11px] text-muted tabular-nums">{c.id}</span>
                <PricePopover price={c.price ?? 0} />
              </div>
              <div className="mt-1 flex flex-wrap gap-1">{c.colors.slice(0, 2).map((x) => <ColorChip key={x} color={x} />)}</div>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
