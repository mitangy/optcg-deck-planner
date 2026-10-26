import { ChevronDown, Menu, Minus, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export const money = (n: number) => `$${n.toFixed(2)}`;

/** One Piece card-colour dots are the only hard-coded colours in the planner. */
export const COLOR_HEX: Record<string, string> = {
  red: "#c0392f", green: "#2f8a55", blue: "#2b72b8", purple: "#7a4aa8", black: "#22282c", yellow: "#e2b020",
};
export const COLOR_NAMES = Object.keys(COLOR_HEX);
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export function ColorDot({ color, className }: { color: string; className?: string }) {
  return <span className={cn("inline-block size-2.5 shrink-0 rounded-full ring-1 ring-black/20", className)} style={{ background: COLOR_HEX[color] }} />;
}

export function ColorChip({ color }: { color: string }) {
  return (
    <Badge variant="outline" className="gap-1.5 pl-1.5">
      <ColorDot color={color} /> {cap(color)}
    </Badge>
  );
}

export function TypeBadge({ type }: { type: string | null }) {
  const t = type ?? "card";
  const variant = t === "leader" ? "default" : t === "character" ? "secondary" : "outline";
  return <Badge variant={variant} className="capitalize">{t}</Badge>;
}

export function CostChip({ cost, className }: { cost: number | null; className?: string }) {
  return (
    <span title="Cost" className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground tabular-nums", className)}>
      {cost ?? "–"}
    </span>
  );
}

export function NeedBadge({ need }: { need: number }) {
  return need > 0 ? (
    <Badge variant="secondary" className="whitespace-nowrap border border-ring/40">need {need}</Badge>
  ) : (
    <Badge variant="outline" className="whitespace-nowrap text-chart-4">complete</Badge>
  );
}

export function Stepper({ value, onChange, max = 99, label }: { value: number; onChange: (n: number) => void; max?: number; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex shrink-0 items-center rounded-lg border border-input bg-background">
      <Button variant="ghost" size="icon" disabled={value <= 0} onClick={() => onChange(value - 1)} aria-label="Remove one"><Minus /></Button>
      <span className="w-7 text-center text-sm font-semibold tabular-nums">{value}</span>
      <Button variant="ghost" size="icon" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label="Add one"><Plus /></Button>
    </div>
  );
}

/** Deterministic fake "Last 3 sold" so screenshots are stable. */
function fakeSales(price: number) {
  const f = [1.04, 0.97, 1.0];
  const d = ["Jan 12", "Jan 9", "Jan 4"];
  return f.map((x, i) => ({ date: d[i], price: Math.max(0.05, Math.round(price * x * 100) / 100), cond: i === 1 ? "Lightly Played" : "Near Mint" }));
}

/** Market price that opens a Popover overlay: the trigger keeps its size, nothing in the row moves. */
export function PricePopover({ price, className }: { price: number; className?: string }) {
  const sales = fakeSales(price);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className={cn("font-semibold tabular-nums underline decoration-dotted decoration-ring underline-offset-4", className)}>
          {money(price)} <ChevronDown className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" collisionPadding={12} className="w-64 max-w-[calc(100vw-24px)]">
        <PopoverHeader>
          <PopoverTitle>Last 3 sold</PopoverTitle>
        </PopoverHeader>
        <ul className="divide-y divide-border text-sm">
          {sales.map((s) => (
            <li key={s.date} className="flex items-baseline justify-between gap-3 py-1.5">
              <span className="min-w-0">{s.date} <span className="text-xs text-muted-foreground">{s.cond}</span></span>
              <span className="font-semibold tabular-nums">{money(s.price)}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">Market {money(price)} · via TCGPlayer</p>
      </PopoverContent>
    </Popover>
  );
}

const NAV = ["Shopping", "Decks", "Meta", "Collection", "Friends", "Group buys", "Import"];
const href = (n: string) => (n === "Decks" ? "#/planner/deck" : n === "Collection" ? "#/planner/collection" : "#");

/** Full-width bar (bg on the <header>); only the inner row is constrained. */
export function TopBar({ active }: { active: "Decks" | "Collection" }) {
  return (
    <header className="sticky top-0 z-30 w-full bg-primary text-primary-foreground shadow-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="-ml-2 text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground lg:hidden" aria-label="Open menu"><Menu /></Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72">
            <SheetHeader><SheetTitle className="font-heading">Planner menu</SheetTitle></SheetHeader>
            <nav className="flex flex-col gap-1 px-4" aria-label="Main">
              {NAV.map((n) => (
                <SheetClose asChild key={n}>
                  <Button asChild variant={n === active ? "secondary" : "ghost"} className="h-10 justify-start text-base"><a href={href(n)}>{n}</a></Button>
                </SheetClose>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="font-heading text-lg font-bold tracking-tight whitespace-nowrap">ONE PIECE</span>
          <span className="font-heading text-base font-medium opacity-80">Planner</span>
        </div>
        <nav className="mx-auto hidden items-center gap-1 lg:flex" aria-label="Main">
          {NAV.map((n) => (
            <a key={n} href={href(n)} aria-current={n === active ? "page" : undefined}
              className="rounded-md px-3 py-1.5 text-sm font-medium opacity-75 transition hover:bg-primary-foreground/10 hover:opacity-100 aria-[current=page]:bg-primary-foreground/15 aria-[current=page]:opacity-100">
              {n}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-3">
          <Button asChild variant="outline" size="sm" className="border-primary-foreground/50 bg-transparent text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground dark:bg-transparent"><a href="#/duel/home">Play Duel</a></Button>
          <span className="hidden text-sm opacity-80 sm:inline">Miko</span>
        </div>
      </div>
    </header>
  );
}

export function Page({ active, children }: { active: "Decks" | "Collection"; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <TopBar active={active} />
      <main className="mx-auto w-full max-w-6xl px-4 pt-6 pb-10 sm:px-6">{children}</main>
    </div>
  );
}
