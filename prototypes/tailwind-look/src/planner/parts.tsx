import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import type { ReactNode } from "react";

export const money = (n: number) => `$${n.toFixed(2)}`;

const COLOR: Record<string, { dot: string; label: string }> = {
  red: { dot: "bg-[#c0392f]", label: "Red" },
  green: { dot: "bg-[#2f8a55]", label: "Green" },
  blue: { dot: "bg-[#2b72b8]", label: "Blue" },
  purple: { dot: "bg-[#7a4aa8]", label: "Purple" },
  black: { dot: "bg-[#22282c]", label: "Black" },
  yellow: { dot: "bg-[#e2b020]", label: "Yellow" },
};

export function ColorChip({ color }: { color: string }) {
  const c = COLOR[color] ?? { dot: "bg-muted", label: color };
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-paper-sunk py-0.5 pr-2.5 pl-1.5 text-xs font-medium text-ink">
      <span className={`size-2.5 rounded-full ring-1 ring-black/20 ${c.dot}`} />
      {c.label}
    </span>
  );
}

export const COLOR_NAMES = Object.keys(COLOR);

const typeTone: Record<string, string> = {
  character: "bg-sea/10 text-sea-ink border-sea/25",
  event: "bg-gold-soft text-gold-ink border-gold/40",
  stage: "bg-[#ece3f3] text-[#5a3a7c] border-[#7a4aa8]/30",
  leader: "bg-luffy/10 text-luffy border-luffy/30",
};
export function TypeChip({ type }: { type: string | null }) {
  const t = type ?? "card";
  return (
    <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold capitalize ${typeTone[t] ?? "border-rule text-muted"}`}>
      {t}
    </span>
  );
}

export function CostChip({ cost }: { cost: number | null }) {
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-sea-night px-1.5 text-[11px] font-bold text-gold-bright tabular-nums" title="Cost">
      {cost ?? "–"}
    </span>
  );
}

export function NeedBadge({ need }: { need: number }) {
  return need > 0 ? (
    <span className="inline-flex items-center rounded-full border border-gold/50 bg-gold-soft px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-gold-ink">need {need}</span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-ok-soft px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-ok">complete</span>
  );
}

export function Stepper({ value, onChange, max = 99, label }: { value: number; onChange: (n: number) => void; max?: number; label: string }) {
  const b = "grid size-8 place-items-center rounded-md text-base leading-none text-sea transition hover:bg-gold-soft disabled:opacity-30 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-sea";
  return (
    <div role="group" aria-label={label} className="inline-flex shrink-0 items-center rounded-lg border border-rule-strong bg-paper">
      <button type="button" className={b} disabled={value <= 0} onClick={() => onChange(value - 1)} aria-label="Remove one">−</button>
      <span className="w-7 text-center text-sm font-semibold tabular-nums">{value}</span>
      <button type="button" className={b} disabled={value >= max} onClick={() => onChange(value + 1)} aria-label="Add one">+</button>
    </div>
  );
}

/** Deterministic fake "Last 3 sold" so screenshots are stable. */
function fakeSales(price: number) {
  const f = [1.04, 0.97, 1.0];
  const d = ["Jan 12", "Jan 9", "Jan 4"];
  return f.map((x, i) => ({ date: d[i], price: Math.max(0.05, Math.round(price * x * 100) / 100), cond: i === 1 ? "Lightly Played" : "Near Mint" }));
}

/** Market price that opens an overlay (anchored, so nothing in the row moves). */
export function PricePopover({ price, className = "" }: { price: number; className?: string }) {
  const sales = fakeSales(price);
  return (
    <Popover className={className}>
      <PopoverButton className="inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 text-sm font-semibold tabular-nums text-ink underline decoration-gold/70 decoration-dotted underline-offset-4 hover:bg-gold-soft data-open:bg-gold-soft focus-visible:outline-2 focus-visible:outline-sea">
        {money(price)}
        <svg viewBox="0 0 10 6" className="w-2 fill-current text-muted"><path d="M0 0h10L5 6z" /></svg>
      </PopoverButton>
      <PopoverPanel anchor={{ to: "bottom end", gap: 6, padding: 12 }} className="z-40 w-64 rounded-xl border border-rule-strong bg-paper p-3.5 shadow-lift [--anchor-max-width:calc(100vw-24px)]">
        <p className="label-caps text-gold-ink">Last 3 sold</p>
        <ul className="mt-2 divide-y divide-rule text-sm">
          {sales.map((s) => (
            <li key={s.date} className="flex items-baseline justify-between gap-3 py-1.5">
              <span className="min-w-0"><span className="text-ink">{s.date}</span> <span className="text-xs text-muted">{s.cond}</span></span>
              <span className="font-semibold tabular-nums">{money(s.price)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">Market {money(price)} · via TCGPlayer</p>
      </PopoverPanel>
    </Popover>
  );
}

const NAV = ["Shopping", "Decks", "Meta", "Collection", "Friends", "Group buys", "Import"];

/** Full-width bar; only the inner row is constrained. */
export function TopBar({ active }: { active: "Decks" | "Collection" }) {
  return (
    <header className="planner-topbar sticky top-0 z-30 w-full">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-0 px-4 pt-2.5 sm:px-6 lg:flex-nowrap lg:py-0">
        <div className="flex min-w-0 items-center gap-3 py-1 lg:py-3">
          <span className="font-display text-[19px] leading-none font-bold tracking-tight text-[#fbf4e2]">ONE PIECE</span>
          <span className="hidden h-6 w-px bg-white/20 sm:block" />
          <span className="font-display text-base font-semibold text-gold-bright">Planner</span>
        </div>
        <nav className="order-last -mx-4 flex min-w-0 basis-full gap-0.5 overflow-x-auto px-3 sm:-mx-6 sm:px-5 lg:order-none lg:mx-0 lg:basis-auto lg:flex-1 lg:justify-center lg:overflow-visible lg:px-0 [mask-image:linear-gradient(90deg,#000_88%,transparent)] lg:[mask-image:none]" aria-label="Main">
          {NAV.map((n) => (
            <a key={n} href={n === "Decks" ? "#/planner/deck" : n === "Collection" ? "#/planner/collection" : "#"} aria-current={n === active ? "page" : undefined} className="planner-nav-link">{n}</a>
          ))}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2 py-1 lg:py-3">
          <a href="#/duel/home" className="rounded-full border border-gold-bright/70 px-3 py-1 text-sm font-semibold text-gold-bright transition hover:bg-gold-bright/15">Play Duel</a>
          <span className="hidden text-sm text-[#cfdadd] sm:inline">Miko</span>
        </div>
      </div>
    </header>
  );
}

export function Page({ active, children }: { active: "Decks" | "Collection"; children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <TopBar active={active} />
      <main className="mx-auto w-full max-w-6xl px-4 pt-6 pb-10 sm:px-6">{children}</main>
    </div>
  );
}
