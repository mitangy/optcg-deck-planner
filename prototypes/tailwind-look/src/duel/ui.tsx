import { Dialog, DialogBackdrop, DialogPanel } from "@headlessui/react";
import { useState, type ReactNode } from "react";

export const COLOR_HEX: Record<string, string> = {
  red: "#c4453a", blue: "#3b86c4", green: "#3f9a68", purple: "#8657bd", black: "#474a57", yellow: "#d9b53a",
};

export function ColorDot({ color, className = "" }: { color: string; className?: string }) {
  return (
    <span
      title={color}
      style={{ background: COLOR_HEX[color] ?? "#888" }}
      className={`inline-block size-3 rounded-full ring-1 ring-white/30 ${className}`}
    />
  );
}

export function Icon({ name, className = "size-5" }: { name: "menu" | "x" | "back" | "dots" | "search" | "plus" | "upload" | "warn" | "heart" | "deck" | "trash" | "bolt" | "sword" | "check"; className?: string }) {
  const d: Record<string, string> = {
    menu: "M4 7h16M4 12h16M4 17h16",
    x: "M6 6l12 12M18 6L6 18",
    back: "M15 6l-6 6 6 6",
    dots: "M5 12h.01M12 12h.01M19 12h.01",
    search: "M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-4.3-4.3",
    plus: "M12 5v14M5 12h14",
    upload: "M12 16V4M7 9l5-5 5 5M5 20h14",
    warn: "M12 9v4M12 17h.01M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z",
    heart: "M12 21s-7-4.6-9.3-9A5.2 5.2 0 0112 6.6 5.2 5.2 0 0121.3 12C19 16.4 12 21 12 21z",
    deck: "M8 4h10a2 2 0 012 2v12M4 8a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2z",
    trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
    bolt: "M13 3L5 14h6l-1 7 8-11h-6z",
    sword: "M14 4l6-1-1 6L9 19l-3-3zM5 15l-2 4 2 2 4-2",
    check: "M5 12l5 5 9-10",
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`} aria-hidden>
      <path d={d[name]} />
    </svg>
  );
}

const LINKS = [
  { label: "Play", href: "#/duel/home" },
  { label: "Decks", href: "#/duel/decks" },
  { label: "Board demo", href: "#/duel/board" },
  { label: "Leaderboard", href: "#/duel/home" },
  { label: "Planner", href: "#/planner/deck" },
];

/** Top bar: spans the viewport edge to edge, only the inner row is constrained. */
export function DuelNav({ active }: { active: "Play" | "Decks" }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 w-full border-b border-chrome/20 bg-arena-abyss/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:gap-4">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="grid size-10 place-items-center rounded-lg border border-chrome/25 bg-arena-panel text-bone transition hover:border-chrome/60 md:hidden"
        >
          <Icon name="menu" />
        </button>
        <a href="#/duel/home" className="font-display text-xl font-bold tracking-wide text-chrome-bright">OPTCG Duel</a>
        <nav className="ml-4 hidden items-center gap-1 md:flex">
          {LINKS.slice(0, 4).map((l) => (
            <a key={l.label} href={l.href} className="tab-link" aria-current={l.label === active ? "page" : undefined}>{l.label}</a>
          ))}
        </nav>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          <a href="#/planner/deck" className="tab-link hidden md:block">Planner</a>
          <span className="hidden items-center gap-2 rounded-full border border-chrome/25 bg-arena-panel px-3 py-1.5 text-sm font-semibold sm:flex">
            <span className="size-2 rounded-full bg-haze" /> Guest
          </span>
          <button className="btn-chrome !px-3.5 !py-1.5">Sign in</button>
        </div>
      </div>

      <Dialog open={open} onClose={setOpen} className="relative z-50 md:hidden">
        <DialogBackdrop transition className="fixed inset-0 bg-black/60 transition duration-200 data-closed:opacity-0" />
        <div className="fixed inset-y-0 left-0 flex w-72 max-w-[85vw]">
          <DialogPanel transition className="flex w-full flex-col gap-1 border-r border-chrome/25 bg-arena-deep p-4 shadow-2xl transition duration-200 data-closed:-translate-x-full">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-display text-xl font-bold text-chrome-bright">OPTCG Duel</span>
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="grid size-9 place-items-center rounded-lg text-haze hover:text-bone"><Icon name="x" /></button>
            </div>
            {LINKS.map((l) => (
              <a key={l.label} href={l.href} onClick={() => setOpen(false)} className="tab-link !py-3 !text-base" aria-current={l.label === active ? "page" : undefined}>{l.label}</a>
            ))}
            <div className="mt-auto flex flex-col gap-2 border-t border-chrome/15 pt-4">
              <button className="btn-chrome">Sign in</button>
              <button className="btn-ghost-duel">Settings</button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </header>
  );
}

export function PageShell({ children, active }: { children: ReactNode; active: "Play" | "Decks" }) {
  return (
    <div className="waves min-h-dvh">
      <DuelNav active={active} />
      <main className="mx-auto w-full max-w-6xl px-4 py-5 sm:py-8">{children}</main>
    </div>
  );
}
