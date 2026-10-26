import { useState } from "react";
import { duelDecks } from "../shared/data";
import { ColorDot, Icon, PageShell } from "./ui";

const MODES = [
  { title: "Play vs Bot", sub: "Casual, never ranked", glyph: "⚙︎", tone: "tide" },
  { title: "Ranked", sub: "15 min each · earns Bounty", glyph: "⚓︎", tone: "chrome" },
  { title: "Practice", sub: "Both sides on this device", glyph: "☸︎", tone: "tide" },
] as const;

const FRIENDS = [
  { name: "Nami_navigator", status: "In lobby", on: true },
  { name: "Zoro_main", status: "Playing · Ranked", on: true },
  { name: "SanjiCooks", status: "Building a deck", on: true },
  { name: "Ussop_snipes", status: "Offline · 2h", on: false },
];

const NEWS = [
  { tag: "New", text: "Tilted board: lean both mats back in perspective." },
  { tag: "Fix", text: "Rested DON!! stay upright on the leader." },
  { tag: "New", text: "Log Pose can build a deck from a match brief." },
];

export default function DuelHome() {
  const [sel, setSel] = useState(0);
  const deck = duelDecks[sel];
  return (
    <PageShell active="Play">
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* Hero: selected deck + the big Play button */}
          <section className="panel-duel relative overflow-hidden p-4 sm:p-5">
            <div className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-tide/25 blur-3xl" />
            <div className="relative flex min-w-0 items-center gap-4 sm:gap-6">
              <img src={deck.leader.image} alt={deck.leader.name} className="aspect-[63/88] w-24 shrink-0 -rotate-3 rounded-lg shadow-[0_14px_30px_rgb(0_0_0/0.55)] ring-1 ring-chrome/40 sm:w-40" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="label-caps text-chrome">Sailing with</span>
                <h1 className="truncate font-display text-3xl font-bold text-bone sm:text-4xl">{deck.name}</h1>
                <p className="flex flex-wrap items-center gap-x-2 text-sm text-haze">
                  <span className="flex gap-1">{deck.leader.colors.map((c) => <ColorDot key={c} color={c} />)}</span>
                  {deck.leader.name} · {deck.size} cards · {deck.wins}W {deck.losses}L
                </p>
                <div className="mt-3 flex gap-2">
                  <a href="#/duel/decks" className="btn-ghost-duel whitespace-nowrap !px-3 !py-1.5">Change deck</a>
                  <a href="#/duel/decks" className="btn-ghost-duel !border-transparent !bg-transparent whitespace-nowrap !px-3 !py-1.5 !text-haze hover:!text-bone">Edit deck</a>
                </div>
              </div>
            </div>
          </section>

          <a href="#/duel/board" className="btn-chrome flex-col !gap-0 !rounded-xl !py-4">
            <span className="font-display text-3xl font-bold leading-none">Play</span>
            <span className="mt-1 text-sm font-semibold opacity-75">Choose a mode</span>
          </a>

          {/* Mode tiles */}
          <section className="grid min-w-0 grid-cols-3 gap-2 sm:gap-3">
            {MODES.map((m) => (
              <button key={m.title} className="group panel-duel flex min-w-0 flex-col items-center gap-2 p-3 text-center transition sm:flex-row sm:gap-3 sm:p-3.5 sm:text-left hover:-translate-y-0.5 hover:border-chrome/60">
                <span className={`grid size-11 shrink-0 place-items-center rounded-lg text-xl ${m.tone === "chrome" ? "bg-chrome/20 text-chrome-bright" : "bg-tide/25 text-tide-bright"}`}>{m.glyph}</span>
                <span className="min-w-0">
                  <span className="block font-display text-base font-semibold leading-tight text-bone sm:text-lg">{m.title}</span>
                  <span className="hidden truncate text-xs text-haze sm:block">{m.sub}</span>
                </span>
              </button>
            ))}
            <div className="panel-duel min-w-0 p-3.5 col-span-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 items-center gap-3 sm:flex-1">
                  <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-tide/25 text-xl text-tide-bright">✉︎</span>
                  <span className="min-w-0">
                    <span className="block font-display text-lg font-semibold">Casual room</span>
                    <span className="block text-xs text-haze">Create one, or join a friend with their code.</span>
                  </span>
                </div>
                <div className="flex min-w-0 gap-2">
                  <input aria-label="Room code" placeholder="Room code" className="field-duel min-w-0 flex-1 text-center font-mono uppercase tracking-[0.3em] sm:w-36 sm:flex-none" />
                  <button className="btn-ghost-duel shrink-0">Join</button>
                  <button className="btn-ghost-duel shrink-0 !border-chrome/60 !text-chrome-bright">Create</button>
                </div>
              </div>
            </div>
          </section>

          {/* Quick-pick strip */}
          <section className="min-w-0">
            <div className="mb-2 flex items-end justify-between">
              <h2 className="label-caps text-chrome">Your decks</h2>
              <a href="#/duel/decks" className="text-xs font-semibold text-tide-bright hover:text-bone">All decks</a>
            </div>
            <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [mask-image:linear-gradient(to_right,#000_calc(100%_-_56px),transparent)]">
              {duelDecks.map((d, i) => (
                <li key={d.name} className="snap-start">
                  <button
                    onClick={() => setSel(i)}
                    className={`group flex w-28 flex-col gap-1.5 rounded-xl border p-2 text-left transition ${i === sel ? "border-chrome bg-arena-raised shadow-[0_0_0_1px_var(--color-chrome)]" : "border-chrome/15 bg-arena-panel/70 hover:border-chrome/50"}`}
                  >
                    <img src={d.leader.image} alt="" className="aspect-[63/88] w-full rounded-md object-cover" />
                    <span className="truncate text-xs font-semibold text-bone">{d.name}</span>
                    <span className="text-[11px] text-haze">{d.wins}-{d.losses}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <section className="panel-duel p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="label-caps text-chrome">Friends online</h2>
              <span className="rounded-full bg-jade/20 px-2 py-0.5 text-[11px] font-semibold text-jade">3 online</span>
            </div>
            <ul className="divide-y divide-chrome/10">
              {FRIENDS.map((f) => (
                <li key={f.name} className="flex min-w-0 items-center gap-3 py-2.5">
                  <span className={`size-2.5 shrink-0 rounded-full ${f.on ? "bg-jade shadow-[0_0_8px_var(--color-jade)]" : "bg-haze/40"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{f.name}</span>
                    <span className="block truncate text-xs text-haze">{f.status}</span>
                  </span>
                  {f.on && <button className="btn-ghost-duel shrink-0 !px-2.5 !py-1 text-xs">Invite</button>}
                </li>
              ))}
            </ul>
          </section>

          <section className="panel-duel p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="label-caps text-chrome">What&apos;s new</h2>
              <span className="text-xs text-haze">Patch 0.9.4</span>
            </div>
            <ul className="flex flex-col gap-3">
              {NEWS.map((n) => (
                <li key={n.text} className="flex gap-3 text-sm">
                  <span className={`mt-0.5 h-fit shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${n.tag === "New" ? "bg-tide/30 text-tide-bright" : "bg-chrome/20 text-chrome-bright"}`}>{n.tag}</span>
                  <span className="min-w-0 text-bone/90">{n.text}</span>
                </li>
              ))}
            </ul>
            <button className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-tide-bright hover:text-bone"><Icon name="check" className="size-3.5" /> Mark all read</button>
          </section>
        </aside>
      </div>
    </PageShell>
  );
}
