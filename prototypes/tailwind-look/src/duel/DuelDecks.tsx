import { Listbox, ListboxButton, ListboxOption, ListboxOptions, Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { useMemo, useState } from "react";
import { duelDecks, type Deck } from "../shared/data";
import { ColorDot, Icon, PageShell } from "./ui";

const SORTS = ["Recently played", "Win rate", "Name"] as const;
const rate = (d: Deck) => d.wins / Math.max(1, d.wins + d.losses);

function DeckMenu() {
  return (
    <Menu>
      <MenuButton aria-label="Deck actions" className="grid size-9 place-items-center rounded-lg border border-white/10 bg-arena-abyss/70 text-bone backdrop-blur transition hover:border-chrome/60 data-open:border-chrome">
        <Icon name="dots" />
      </MenuButton>
      <MenuItems transition anchor="bottom end" className="menu-panel [--anchor-gap:6px]">
        {["Edit", "Duplicate", "Play"].map((l) => <MenuItem key={l}><button className="menu-item">{l}</button></MenuItem>)}
        <div className="my-1 h-px bg-chrome/15" />
        <MenuItem><button className="menu-item !text-crimson-bright data-focus:!bg-crimson/20">Delete</button></MenuItem>
      </MenuItems>
    </Menu>
  );
}

function DeckCard({ d }: { d: Deck }) {
  const total = d.wins + d.losses;
  const pct = Math.round(rate(d) * 100);
  return (
    <li className={`group relative flex min-w-0 flex-col overflow-hidden rounded-xl border bg-arena-panel shadow-[0_10px_30px_rgb(0_0_0/0.35)] transition hover:-translate-y-0.5 ${d.valid ? "border-chrome/20 hover:border-chrome/55" : "border-crimson/60"}`}>
      <div className="relative h-32 overflow-hidden bg-arena-abyss">
        <img src={d.leader.image} alt={d.leader.name} className="absolute inset-0 size-full object-cover object-[50%_22%] transition duration-300 group-hover:scale-110" />
        <div className="absolute inset-0 bg-linear-to-t from-arena-panel via-arena-panel/20 to-transparent" />
        <div className="absolute right-2 top-2"><DeckMenu /></div>
        <div className="absolute bottom-2 left-3 flex gap-1">{d.leader.colors.map((c) => <ColorDot key={c} color={c} className="size-3.5" />)}</div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-3.5 pt-2">
        <div className="min-w-0">
          <h3 className="truncate font-display text-lg font-semibold leading-tight text-bone">{d.name}</h3>
          <p className="truncate text-xs text-haze">{d.leader.name}</p>
        </div>
        {!d.valid && (
          <p className="flex items-start gap-1.5 rounded-lg border border-crimson/40 bg-crimson/15 px-2.5 py-1.5 text-xs font-medium text-[#f0a79f]">
            <Icon name="warn" className="mt-px size-3.5" /> Not legal: 5 copies of OP06-094
          </p>
        )}
        <div className="mt-auto grid grid-cols-2 gap-3 text-xs">
          <div>
            <span className="label-caps block !text-[10px] text-haze">Cards</span>
            <span className="font-semibold text-bone">{d.size}<span className="text-haze">/50</span></span>
            <div className="mt-1 h-1 rounded-full bg-arena-abyss"><div className="h-full rounded-full bg-tide-bright" style={{ width: `${(d.size / 50) * 100}%` }} /></div>
          </div>
          <div>
            <span className="label-caps block !text-[10px] text-haze">Record</span>
            <span className="font-semibold"><span className="text-jade">{d.wins}W</span> <span className="text-crimson-bright">{d.losses}L</span> <span className="text-haze">· {pct}%</span></span>
            <div className="mt-1 flex h-1 overflow-hidden rounded-full bg-crimson/70"><div className="h-full bg-jade" style={{ width: `${(d.wins / Math.max(1, total)) * 100}%` }} /></div>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-chrome/10 pt-2.5 text-[11px] text-haze">
          <span>Updated {d.updated}</span>
          <a href="#/duel/board" className="font-semibold text-chrome-bright hover:text-bone">Play →</a>
        </div>
      </div>
    </li>
  );
}

export default function DuelDecks() {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<(typeof SORTS)[number]>("Recently played");
  const list = useMemo(() => {
    const f = duelDecks.filter((d) => (d.name + d.leader.name).toLowerCase().includes(q.toLowerCase()));
    if (sort === "Win rate") return [...f].sort((a, b) => rate(b) - rate(a));
    if (sort === "Name") return [...f].sort((a, b) => a.name.localeCompare(b.name));
    return f;
  }, [q, sort]);
  return (
    <PageShell active="Decks">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="font-display text-4xl font-bold text-chrome-bright">Decks</h1>
          <p className="text-sm text-haze">Choose a deck to edit, or create a new one.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost-duel">Meta decks</button>
          <button className="btn-ghost-duel"><Icon name="upload" className="size-4" /> Import</button>
          <button className="btn-chrome"><Icon name="plus" className="size-4" /> New deck</button>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-3">
        <label className="relative min-w-0 flex-1 basis-56">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-haze" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search decks or leaders" className="field-duel !pl-9" />
        </label>
        <Listbox value={sort} onChange={setSort}>
          <ListboxButton className="btn-ghost-duel min-w-44 justify-between"><span><span className="text-haze">Sort:</span> {sort}</span><span className="text-haze">▾</span></ListboxButton>
          <ListboxOptions transition anchor="bottom end" className="menu-panel [--anchor-gap:6px]">
            {SORTS.map((s) => (
              <ListboxOption key={s} value={s} className="menu-item cursor-pointer data-selected:text-chrome-bright">{s}</ListboxOption>
            ))}
          </ListboxOptions>
        </Listbox>
      </div>

      <ul className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        {list.map((d) => <DeckCard key={d.name} d={d} />)}
        <li className="flex min-h-40 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-chrome/30 p-4 text-center text-sm text-haze">
          <span className="label-caps text-chrome">From your planner</span>
          Planner decks appear after <a className="font-semibold text-chrome-bright underline underline-offset-2" href="#/duel/home">signing in with Google</a>.
        </li>
      </ul>
    </PageShell>
  );
}
