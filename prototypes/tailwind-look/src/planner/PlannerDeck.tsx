import { Disclosure, DisclosureButton, DisclosurePanel, Listbox, ListboxButton, ListboxOption, ListboxOptions, Menu, MenuButton, MenuItem, MenuItems, Tab, TabGroup, TabList } from "@headlessui/react";
import { useMemo, useState } from "react";
import { plannerDeck, type Card } from "../shared/data";
import DeckStats from "./DeckStats";
import { ColorChip, CostChip, NeedBadge, Page, PricePopover, Stepper, TypeChip, money } from "./parts";

const SORTS = [
  { id: "cost", label: "Cost" },
  { id: "need", label: "Still needed" },
  { id: "price", label: "Price" },
  { id: "name", label: "Name" },
] as const;
type SortId = (typeof SORTS)[number]["id"];

const GRID = "md:grid md:grid-cols-[minmax(0,1fr)_96px_132px_92px_84px] md:items-center md:gap-x-4";
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

function Chevron() {
  return <svg viewBox="0 0 10 6" className="w-2 shrink-0 fill-current text-muted"><path d="M0 0h10L5 6z" /></svg>;
}

export default function PlannerDeck() {
  const { leader, cards, name, event, placing, players } = plannerDeck;
  const [owned, setOwned] = useState<Record<string, number>>(() => Object.fromEntries(cards.map((c) => [c.id, c.owned ?? 0])));
  const [view, setView] = useState(0);
  const [mode, setMode] = useState(0);
  const [sort, setSort] = useState<(typeof SORTS)[number]>(SORTS[0]);
  const [q, setQ] = useState("");
  const [onlyNeed, setOnlyNeed] = useState(false);
  const [types, setTypes] = useState<Record<string, boolean>>({ character: true, event: true, stage: true });

  const need = (c: Card) => Math.max(0, (c.count ?? 0) - (owned[c.id] ?? 0));
  const totals = useMemo(() => {
    const total = cards.reduce((n, c) => n + (c.count ?? 0), 0);
    const have = cards.reduce((n, c) => n + Math.min(c.count ?? 0, owned[c.id] ?? 0), 0);
    const cost = cards.reduce((n, c) => n + need(c) * (c.price ?? 0), 0);
    const uTotal = cards.length;
    const uHave = cards.filter((c) => (owned[c.id] ?? 0) >= (c.count ?? 0)).length;
    return { total, have, cost, still: total - have, uTotal, uHave };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owned, cards]);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = cards.filter((c) => (!t || c.name.toLowerCase().includes(t) || c.id.toLowerCase().includes(t)) && (!onlyNeed || need(c) > 0) && types[c.type ?? ""] !== false);
    const by: Record<SortId, (a: Card, b: Card) => number> = {
      cost: (a, b) => (a.cost ?? 0) - (b.cost ?? 0) || a.name.localeCompare(b.name),
      need: (a, b) => need(b) - need(a),
      price: (a, b) => (b.price ?? 0) - (a.price ?? 0),
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return [...list].sort(by[sort.id]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, q, onlyNeed, types, sort, owned]);

  const uniq = mode === 1;
  const [have, all] = uniq ? [totals.uHave, totals.uTotal] : [totals.have, totals.total];
  const pct = Math.round((have / all) * 100);
  const setOwn = (id: string) => (n: number) => setOwned((o) => ({ ...o, [id]: n }));
  const activeFilters = (onlyNeed ? 1 : 0) + Object.values(types).filter((v) => !v).length;

  return (
    <Page active="Decks">
      {/* Deck header */}
      <section className="flex gap-4 sm:gap-6">
        <img src={leader.image} alt={leader.name} loading="eager" className="h-[134px] w-24 shrink-0 rounded-lg border border-sea-night/40 object-cover shadow-lift sm:h-[168px] sm:w-[120px]" />
        <div className="min-w-0 flex-1 self-center">
          <a href="#/planner/deck" className="label-caps text-gold-ink hover:underline">← Decks</a>
          <h1 className="mt-1 font-display text-3xl leading-tight font-semibold text-sea-night sm:text-4xl">{name}</h1>
          <p className="mt-1 text-sm text-muted">
            Leader {leader.id} · {leader.name}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {leader.colors.map((c) => <ColorChip key={c} color={c} />)}
            <span className="inline-flex items-center rounded-full bg-gold-soft px-2.5 py-0.5 text-xs font-semibold text-gold-ink">
              {event} · #{placing} of {players}
            </span>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button className="btn-sea">Edit deck</button>
            <a href="#/duel/decks" className="btn-paper py-2">Play in Duel</a>
            <ActionMenu label="Share" items={["Copy share link", "Export decklist", "Print proxies"]} />
            <ActionMenu label="More" items={["Rename deck", "Duplicate", "Hide from friends", "Delete deck"]} danger="Delete deck" />
          </div>
        </div>
      </section>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
      {/* Mobile stats */}
      <Disclosure as="div" className="panel-paper mb-5 lg:hidden">
        <DisclosureButton className="group flex w-full items-center justify-between px-4 py-3 text-left font-display text-lg font-semibold text-sea-night">
          Deck stats
          <svg viewBox="0 0 10 6" className="w-2.5 fill-current text-muted transition group-data-open:rotate-180"><path d="M0 0h10L5 6z" /></svg>
        </DisclosureButton>
        <DisclosurePanel className="border-t border-rule p-4"><DeckStats cards={cards} /></DisclosurePanel>
      </Disclosure>
      {/* Totals */}
      <section className="panel-paper grid gap-x-8 gap-y-4 p-4 sm:p-5 md:grid-cols-[1fr_auto] md:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <TabGroup selectedIndex={mode} onChange={setMode}>
              <TabList className="inline-flex rounded-full border border-rule-strong bg-parchment-deep/70 p-0.5">
                {["Copies", "Uniques"].map((t) => (
                  <Tab key={t} className="rounded-full px-3.5 py-1 text-sm font-semibold text-muted outline-none transition data-hover:text-ink data-selected:bg-paper data-selected:text-sea data-selected:shadow-sm data-focus:outline-2 data-focus:outline-sea">{t}</Tab>
                ))}
              </TabList>
            </TabGroup>
            <p className="text-sm">
              <span className="font-display text-2xl font-semibold text-sea-night tabular-nums">{have}</span>
              <span className="text-muted"> / {all} {uniq ? "uniques" : "copies"} owned</span>
              <span className="mx-2 text-rule-strong">·</span>
              <span className="font-semibold">{all - have}</span> still needed
            </p>
            </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-parchment-deep" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Deck completion">
            <div className="h-full rounded-full bg-linear-to-r from-gold to-gold-bright transition-[width]" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <dl className="flex items-baseline gap-x-6 md:border-l md:border-rule md:pl-8">
          <div>
            <dt className="label-caps text-muted">Cost to complete</dt>
            <dd className="font-display text-2xl font-semibold text-gold-ink tabular-nums">{money(totals.cost)}</dd>
          </div>
        </dl>
      </section>

      {/* Toolbar */}
      <section className="mt-5 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, ID…" aria-label="Search deck" className="planner-field min-w-0 flex-1 basis-full sm:basis-64" />

        <Listbox value={sort} onChange={setSort}>
          <div className="relative">
            <ListboxButton className="btn-paper h-[38px] gap-2">
              <span className="text-muted">Sort</span> {sort.label} <Chevron />
            </ListboxButton>
            <ListboxOptions anchor="bottom start" className="planner-menu">
              {SORTS.map((s) => (
                <ListboxOption key={s.id} value={s} className="planner-menu-item data-selected:font-semibold">
                  {s.label}
                  <span className="hidden text-sea in-data-selected:inline">✓</span>
                </ListboxOption>
              ))}
            </ListboxOptions>
          </div>
        </Listbox>

        <Menu>
          <MenuButton className="btn-paper h-[38px] gap-2">
            Filters
            {activeFilters > 0 && <span className="grid size-5 place-items-center rounded-full bg-warn text-[11px] font-bold text-white">{activeFilters}</span>}
            <Chevron />
          </MenuButton>
          <MenuItems anchor="bottom start" className="planner-menu">
            <MenuItem>
              <button className="planner-menu-item" onClick={(e) => { e.preventDefault(); setOnlyNeed((v) => !v); }}>
                Still needed only <Tick on={onlyNeed} />
              </button>
            </MenuItem>
            <div className="my-1 h-px bg-rule" />
            {Object.keys(types).map((t) => (
              <MenuItem key={t}>
                <button className="planner-menu-item" onClick={(e) => { e.preventDefault(); setTypes((v) => ({ ...v, [t]: !v[t] })); }}>
                  {cap(t)}s <Tick on={types[t]} />
                </button>
              </MenuItem>
            ))}
          </MenuItems>
        </Menu>

        <TabGroup selectedIndex={view} onChange={setView} className="ml-auto">
          <TabList className="inline-flex rounded-full border border-rule-strong bg-parchment-deep/70 p-0.5">
            {["List", "Grid"].map((t) => (
              <Tab key={t} className="rounded-full px-4 py-1.5 text-sm font-semibold text-muted outline-none transition data-hover:text-ink data-selected:bg-paper data-selected:text-sea data-selected:shadow-sm data-focus:outline-2 data-focus:outline-sea">
                {t}
              </Tab>
            ))}
          </TabList>
        </TabGroup>
      </section>

      <h2 className="mt-6 mb-2.5 flex items-baseline gap-3 font-display text-2xl font-semibold text-sea-night">
        Deck list <span className="font-body text-sm font-normal text-muted">{rows.length} cards</span>
      </h2>

      {view === 0 ? (
        <div className="panel-paper overflow-hidden">
          <div className={`${GRID} hidden border-b border-rule bg-paper-sunk px-4 py-2.5 label-caps text-muted`}>
            <span>Card</span><span>Type · Cost</span><span>Owned</span><span>Need</span><span className="text-right">Market</span>
          </div>
          <ul className="divide-y divide-rule">
            {rows.map((c) => (
              <li key={c.id} className={`${GRID} flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3 sm:px-4 md:flex-nowrap`}>
                <div className="flex min-w-0 basis-full items-center gap-3 md:basis-auto">
                  <img src={c.image} alt="" loading="eager" className="h-[70px] w-[50px] shrink-0 rounded-md border border-sea-night/30 object-cover" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">{c.name}</p>
                    <p className="text-xs text-muted tabular-nums">{c.id} · ×{c.count} in deck</p>
                    <div className="mt-1 flex items-center gap-1.5 md:hidden"><TypeChip type={c.type} /><CostChip cost={c.cost} /></div>
                  </div>
                </div>
                <div className="hidden items-center gap-1.5 md:flex"><TypeChip type={c.type} /><CostChip cost={c.cost} /></div>
                <div className="md:justify-self-start"><Stepper value={owned[c.id] ?? 0} onChange={setOwn(c.id)} label={`${c.name} owned`} /></div>
                <div className="md:justify-self-start"><NeedBadge need={need(c)} /></div>
                <PricePopover price={c.price ?? 0} className="ml-auto md:ml-0 md:justify-self-end" />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {rows.map((c) => (
            <li key={c.id} className="panel-paper flex min-w-0 flex-col p-2.5">
              <div className="relative">
                <img src={c.image} alt={c.name} loading="eager" className="aspect-[5/7] w-full rounded-md border border-sea-night/30 object-cover" />
                <span className="absolute top-1.5 right-1.5 rounded-full bg-sea-night px-2 py-0.5 text-xs font-bold text-gold-bright tabular-nums">×{c.count}</span>
                <span className="absolute top-1.5 left-1.5"><CostChip cost={c.cost} /></span>
              </div>
              <p className="mt-2 truncate text-sm font-semibold" title={c.name}>{c.name}</p>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-1">
                <NeedBadge need={need(c)} />
                <PricePopover price={c.price ?? 0} />
              </div>
              <div className="mt-2"><Stepper value={owned[c.id] ?? 0} onChange={setOwn(c.id)} label={`${c.name} owned`} /></div>
            </li>
          ))}
        </ul>
      )}
      </div>
      <aside className="panel-paper sticky top-[72px] hidden p-4 lg:block">
        <h2 className="mb-3 font-display text-lg font-semibold text-sea-night">Deck stats</h2>
        <DeckStats cards={cards} />
      </aside>
      </div>
    </Page>
  );
}

function ActionMenu({ label, items, danger }: { label: string; items: string[]; danger?: string }) {
  return (
    <Menu>
      <MenuButton className="btn-paper gap-1.5 border-transparent bg-transparent py-2 data-open:bg-gold-soft">
        {label} <Chevron />
      </MenuButton>
      <MenuItems anchor="bottom start" className="planner-menu">
        {items.map((i) => (
          <MenuItem key={i}>
            <button className={`planner-menu-item ${i === danger ? "text-luffy" : ""}`}>{i}</button>
          </MenuItem>
        ))}
      </MenuItems>
    </Menu>
  );
}

function Tick({ on }: { on: boolean }) {
  return (
    <span className={`grid size-4 place-items-center rounded border text-[10px] leading-none ${on ? "border-sea bg-sea text-white" : "border-rule-strong bg-paper text-transparent"}`}>✓</span>
  );
}
