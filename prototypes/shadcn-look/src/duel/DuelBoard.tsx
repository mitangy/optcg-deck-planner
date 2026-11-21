import { ArrowLeft, Heart, Layers, Trash2, Zap, Swords, MoreHorizontal, ScrollText } from "lucide-react";
import { board, CARD_BACK, DON_ART, type Card as GameCard } from "../shared/data";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Kbd } from "@/components/ui/kbd";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ColorDot } from "./shell";

/*
 * Board sizing lives in ONE custom property, --cw (card width): slots, piles, DON and hand all derive
 * from it, so portrait / landscape / desktop differ by one line each. `short:` = max-height 520px.
 */
const SIZE =
  "[--cw:min(70px,calc((100vw_-_52px)/5.9))] sm:[--cw:min(80px,calc((100vw_-_80px)/12.1))] " +
  "lg:[--cw:min(92px,calc((100vw_-_384px)/12.1),calc((100dvh_-_270px)/5.7))] " +
  "short:[--cw:min(64px,calc((100vw_-_262px)/12.1),calc((100dvh_-_140px)/3.95))]";

const PHASES = ["Refresh", "Draw", "DON!!", "Main", "End"];
const LOG = [
  { who: "foe", title: "Guard Point", text: "Opponent countered +1000" },
  { who: "me", title: "Buckin", text: "You attacked · Turn 6" },
  { who: "me", title: "Kyo", text: "You played · Turn 6" },
  { who: "foe", title: "Battle hits", text: "7000 vs 6000" },
  { who: "foe", title: "Opponent takes 1 damage", text: "Life 4 → 3" },
  { who: "me", title: "Don Marlon", text: "You played · Turn 6" },
  { who: "foe", title: "Magura", text: "Opponent played · Turn 5" },
  { who: "me", title: "DON!! +2", text: "Attached to Buckin" },
  { who: "foe", title: "Isshō", text: "Opponent played · Turn 5" },
  { who: "me", title: "Refresh", text: "Turn 6 begins" },
];

/** Big preview on hover (desktop); touch devices simply never open it. */
function Preview({ card, children }: { card: GameCard; children: React.ReactNode }) {
  return (
    <HoverCard openDelay={250} closeDelay={50}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent side="top" className="flex w-72 gap-3 p-3">
        <img src={card.image} alt={card.name} className="aspect-[63/88] w-28 shrink-0 rounded-md" />
        <div className="min-w-0 space-y-1.5 text-xs">
          <div className="font-heading text-sm leading-tight font-semibold">{card.name}</div>
          <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
            {card.colors.map((c) => <ColorDot key={c} color={c} className="size-2.5" />)}
            <span>Cost {card.cost ?? "–"}</span>
            {card.power != null && <span>· {card.power}</span>}
          </div>
          <p className="line-clamp-6 text-muted-foreground">{card.text}</p>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

/** A face-up card filling its parent. Rested cards are rotated 90deg about the slot centre. */
function Face({ card, rested, big, hidePower }: { card: GameCard; rested?: boolean; big?: boolean; hidePower?: boolean }) {
  const power = (card.power ?? 0) + (card.don ?? 0) * 1000;
  const counter = rested ? "-rotate-90" : "";
  return (
    <Preview card={card}>
      <div className={`absolute aspect-[63/88] w-full overflow-hidden rounded-[7%] bg-background shadow-md ring-1 ring-foreground/25 transition-transform ${rested ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-90 brightness-90" : "inset-0"}`}>
        <img src={card.image} alt={card.name} draggable={false} className="size-full object-cover" />
        {card.power != null && !hidePower && (
          <Badge variant={card.don ? "default" : "secondary"} className={`absolute h-4 rounded px-1 text-[9px] font-bold tabular-nums ${counter} ${rested ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" : "bottom-0.5 left-0.5"}`}>{power}</Badge>
        )}
        {!!card.don && <Badge className={`absolute top-0.5 right-0.5 h-4 rounded px-1 text-[9px] font-bold ${counter}`}>+{card.don} DON</Badge>}
        {big && <span className="absolute inset-x-0 bottom-0 hidden truncate bg-linear-to-t from-black/85 to-transparent px-1.5 pt-3 pb-0.5 text-[10px] font-semibold text-white lg:block short:!hidden">{card.name}</span>}
      </div>
    </Preview>
  );
}

function Back({ className = "" }: { className?: string }) {
  return <img src={CARD_BACK} alt="" draggable={false} className={`aspect-[63/88] rounded-[7%] object-cover ring-1 ring-foreground/25 ${className}`} />;
}

function Slot({ label, children, className = "" }: { label?: string; children?: React.ReactNode; className?: string }) {
  return (
    <div className={`relative aspect-[63/88] w-full ${className}`}>
      {children ?? <div className="grid size-full place-items-center rounded-[7%] border border-dashed border-foreground/15 text-[9px] font-semibold tracking-widest text-foreground/25 uppercase sm:text-[10px]">{label}</div>}
    </div>
  );
}

function Count({ n, className = "" }: { n: number | string; className?: string }) {
  return <Badge variant="secondary" className={`absolute z-10 h-5 rounded-full border-border bg-card px-1.5 text-[11px] font-bold text-primary tabular-nums ${className}`}>{n}</Badge>;
}

function Chip({ icon: I, n, label, tone = "" }: { icon: typeof Heart; n: number; label: string; tone?: string }) {
  return (
    <Badge variant="outline" title={label} className="h-7 w-full min-w-0 justify-start gap-1.5 rounded-lg bg-background/30 px-2 text-sm font-bold">
      <I className={`!size-3.5 ${tone || "text-primary"}`} /><span className="tabular-nums">{n}</span>
      <span className="truncate text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</span>
    </Badge>
  );
}

const CHAR_COL = ["col-start-1 sm:col-start-4", "col-start-2 sm:col-start-5", "col-start-3 sm:col-start-6", "col-start-4 sm:col-start-7", "col-start-5 sm:col-start-8"];

function Don({ active, rested, deck, foe }: { active: number; rested: number; deck: number; foe?: boolean }) {
  const one = (state: "a" | "r", i: number) => (
    <div key={state + i} className={`relative shrink-0 ${state === "a" ? "w-(--dw)" : "w-(--dh)"} h-(--dh)`}>
      <img src={DON_ART} alt="" draggable={false} className={`absolute top-1/2 left-1/2 aspect-[63/88] w-(--dw) -translate-x-1/2 -translate-y-1/2 rounded-[7%] object-cover ring-1 ring-foreground/30 ${state === "r" ? "rotate-90 opacity-55 grayscale-[.5]" : "shadow-[0_0_8px_var(--primary)]"}`} />
    </div>
  );
  return (
    <div className="col-span-full row-start-3 flex min-w-0 items-center gap-1.5 rounded-lg bg-background/25 px-2 py-1 [--dh:calc(var(--dw)*88/63)] [--dw:calc(var(--cw)*.4)] sm:row-start-2">
      <span className="shrink-0 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">DON!! <b className={`${foe ? "text-destructive" : "text-primary"} tabular-nums`}>{active}/{active + rested}</b></span>
      <div className="flex min-w-0 flex-1 items-center gap-[calc(var(--dw)*.12)]">
        {Array.from({ length: active }, (_, i) => one("a", i))}
        {Array.from({ length: rested }, (_, i) => one("r", i))}
      </div>
      <div className="relative ml-auto w-(--dw) shrink-0">
        <img src={DON_ART} alt="DON deck" className="aspect-[63/88] w-full rounded-[7%] object-cover opacity-90 ring-1 ring-chart-4/60" />
        <Count n={deck} className="-right-1 -bottom-1 !h-4 !px-1 !text-[10px]" />
      </div>
    </div>
  );
}

function Mat({ foe, side, trashCard, going }: { foe?: boolean; side: typeof board.me | typeof board.opp; trashCard: GameCard; going: string }) {
  const chars = side.chars;
  return (
    <section className={`relative mt-3 grid min-w-0 grid-cols-[repeat(5,var(--cw))] justify-between gap-y-2 rounded-2xl px-4 pt-4 pb-2.5 sm:grid-cols-[repeat(10,var(--cw))] sm:justify-center sm:gap-x-[calc(var(--cw)*.22)] sm:px-2.5 ${foe ? "bg-mat-foe ring-1 ring-destructive/40" : "bg-mat ring-2 ring-primary/60"}`}>
      <Badge variant={foe ? "outline" : "default"} className={`absolute -top-2.5 left-3 z-20 gap-1.5 text-[11px] font-bold sm:left-1/2 sm:-translate-x-1/2 ${foe ? "border-destructive/50 bg-card text-destructive" : ""}`}>
        {side.name} <span className="font-medium opacity-70">· {going}</span>
      </Badge>

      {/* Phone only: life/deck/trash/DON as stat chips beside leader + stage */}
      <div className="col-span-3 col-start-3 row-start-1 grid grid-cols-2 content-center gap-1.5 sm:hidden">
        <Chip icon={Heart} n={side.life} label="Life" tone="text-destructive" />
        <Chip icon={Layers} n={side.deck} label="Deck" />
        <Chip icon={Trash2} n={side.trash} label="Trash" />
        <Chip icon={Zap} n={side.don.deck} label="DON" tone="text-chart-4" />
      </div>

      <Slot className="hidden sm:col-start-1 sm:row-start-1 sm:block">
        <div className="flex size-full flex-col gap-[3%]">
          {Array.from({ length: side.life }, (_, i) => (
            <div key={i} className="min-h-0 flex-1 overflow-hidden rounded-[6%] ring-1 ring-foreground/25"><img src={CARD_BACK} alt="" className="w-full object-cover object-top" /></div>
          ))}
        </div>
        <Count n={side.life} className="-bottom-1.5 left-1/2 -translate-x-1/2" />
      </Slot>

      <Slot className="col-start-1 row-start-1 sm:col-start-2"><Face card={side.leader} big /></Slot>
      <Slot label="Stage" className="col-start-2 row-start-1 sm:col-start-3" />

      {Array.from({ length: 5 }, (_, i) => (
        <Slot key={i} className={`row-start-2 sm:row-start-1 ${CHAR_COL[i]}`} label="">
          {chars[i] ? <Face card={chars[i]} rested={chars[i].rested} big /> : undefined}
        </Slot>
      ))}

      <Slot className="hidden sm:col-start-9 sm:row-start-1 sm:block">
        <Back className="size-full shadow-[2px_2px_0_var(--border),4px_4px_0_var(--muted)]" />
        <Count n={side.deck} className="-bottom-1.5 left-1/2 -translate-x-1/2" />
      </Slot>
      <Slot className="hidden sm:col-start-10 sm:row-start-1 sm:block">
        <Face card={{ ...trashCard, power: null }} />
        <Count n={side.trash} className="-bottom-1.5 left-1/2 -translate-x-1/2" />
      </Slot>

      <Don active={side.don.active} rested={side.don.rested} deck={side.don.deck} foe={foe} />
    </section>
  );
}

function CostPip({ n, className = "" }: { n: number | null; className?: string }) {
  return <Badge className={`absolute z-10 size-5 justify-center rounded-full border-foreground/30 p-0 text-[11px] font-bold shadow ${className}`}>{n}</Badge>;
}

function Hand({ cards, grid }: { cards: GameCard[]; grid?: boolean }) {
  const mid = (cards.length - 1) / 2;
  const afford = (c: GameCard) => (c.cost ?? 0) <= board.me.don.active;
  if (grid) {
    return (
      <div className="grid grid-cols-3 gap-1.5">
        {cards.map((c) => (
          <div key={c.id} className={`relative aspect-[63/88] ${afford(c) ? "" : "brightness-[.6]"}`}>
            <Face card={c} hidePower />
            <CostPip n={c.cost} className="top-0.5 left-0.5 !size-4 !text-[10px]" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="flex items-end justify-center pt-4 pb-1 [--hw:calc(var(--cw)*1.25)] [--ov:.42] lg:[--ov:.12]">
      {cards.map((c, i) => (
        <div
          key={c.id}
          style={{ "--r": `${(i - mid) * 3.5}deg`, "--y": `${Math.pow(i - mid, 2) * 2}px`, zIndex: i } as React.CSSProperties}
          className={`relative -ml-[calc(var(--hw)*var(--ov))] aspect-[63/88] w-(--hw) shrink-0 translate-y-(--y) rotate-(--r) transition-transform first:ml-0 hover:z-30 hover:-translate-y-5 hover:rotate-0 ${afford(c) ? "drop-shadow-[0_0_6px_var(--primary)]" : "brightness-[.6] saturate-50"}`}
        >
          <Face card={c} hidePower />
          <CostPip n={c.cost} className="top-1 left-1" />
        </div>
      ))}
    </div>
  );
}

function PhaseStrip({ small }: { small?: boolean }) {
  return (
    <Tabs value={board.phase} className="w-full">
      <TabsList className="pointer-events-none h-auto w-full">
        {PHASES.map((p) => (
          <TabsTrigger key={p} value={p} tabIndex={-1} className={`min-w-0 flex-1 px-0.5 font-bold tracking-wide uppercase data-active:bg-primary data-active:text-primary-foreground dark:data-active:bg-primary dark:data-active:text-primary-foreground ${small ? "py-0.5 text-[7.5px] tracking-normal" : "py-1 text-[9px]"}`}>{p}</TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

function LogList() {
  return (
    <ul className="flex flex-col gap-1.5 pr-3">
      {LOG.map((l, i) => (
        <li key={i} className={`border-l-2 py-0.5 pl-2.5 ${l.who === "me" ? "border-primary" : "border-destructive"}`}>
          <div className="truncate text-sm font-semibold">{l.title}</div>
          <div className="truncate text-xs text-muted-foreground">{l.text}</div>
        </li>
      ))}
    </ul>
  );
}

/** Phone battle log: a bottom Sheet. Trigger is passed in so the header (landscape) and action bar (portrait) can share it. */
function LogSheet({ children }: { children: React.ReactNode }) {
  return (
    <Sheet>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent side="bottom" className="max-h-[75dvh] rounded-t-2xl short:max-h-[92dvh]">
        <SheetHeader><SheetTitle className="font-heading">Battle log</SheetTitle><SheetDescription>Recent plays · {LOG.length} events</SheetDescription></SheetHeader>
        <ScrollArea className="h-[45dvh] px-4 pb-4 short:h-[60dvh]"><LogList /></ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function Actions({ compact }: { compact?: boolean }) {
  return (
    <div className={`grid gap-2 ${compact ? "" : "grid-cols-2"}`}>
      <Button size="lg" className={`relative ${compact ? "h-9" : "col-span-2 h-11 text-base"}`}>
        End turn {!compact && <Kbd className="absolute right-3 bg-primary-foreground/15 text-primary-foreground">Space</Kbd>}
      </Button>
      {!compact && (
        <>
          <Button variant="outline" size="lg"><Swords /> Attack</Button>
          <Button variant="outline" size="lg"><Zap /> Activate</Button>
        </>
      )}
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string | number }) {
  return <div className="text-center"><div className="text-[9px] font-semibold tracking-widest text-muted-foreground uppercase">{k}</div><div className="text-lg leading-tight font-bold tabular-nums">{v}</div></div>;
}

function PlayerRow({ foe }: { foe?: boolean }) {
  const s = foe ? board.opp : board.me;
  return (
    <Card size="sm" className={foe ? "" : "ring-primary/50"}>
      <CardContent className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-sm font-bold">
          <span className="flex items-center gap-2">
            <Avatar size="sm"><AvatarFallback className={foe ? "text-destructive" : "text-primary"}>{s.name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
            {foe ? "Opponent" : "You"}
          </span>
          <Badge variant="outline" className="text-[10px]">{foe ? "2nd" : "1st"}</Badge>
        </div>
        <div className="grid grid-cols-4">
          <Stat k="Life" v={s.life} /><Stat k="Hand" v={foe ? board.opp.hand : board.me.hand.length} /><Stat k="Deck" v={s.deck} /><Stat k="DON!!" v={`${s.don.active}/${s.don.active + s.don.rested}`} />
        </div>
      </CardContent>
    </Card>
  );
}

function BoardMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label="Match menu"><MoreHorizontal /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem>Settings</DropdownMenuItem>
        <DropdownMenuItem>Battle log</DropdownMenuItem>
        <DropdownMenuItem>Offer draw</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">Concede</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function DuelBoard() {
  const { me, opp } = board;
  return (
    <div className={`flex h-dvh min-w-0 flex-col overflow-hidden bg-background text-foreground ${SIZE}`}>
      <header className="flex h-11 shrink-0 items-center gap-2 border-b bg-card/80 px-3 short:h-10">
        <Button asChild variant="ghost" size="icon" aria-label="Leave match"><a href="#/duel/home"><ArrowLeft /></a></Button>
        <span className="font-heading text-base font-bold text-primary max-sm:hidden">OPTCG Duel</span>
        <Badge variant="outline" className="h-6 px-2.5 font-bold tracking-wider uppercase">{board.phase} · T{board.turn}</Badge>
        <Badge className="h-6 px-2.5 font-bold tracking-wider uppercase">Your turn</Badge>
        <span className="ml-auto hidden items-center gap-1.5 text-xs font-semibold text-muted-foreground short:flex"><Back className="w-3.5" />{opp.hand} in hand</span>
        <LogSheet><Button variant="outline" size="sm" className="hidden short:inline-flex"><ScrollText /> Log</Button></LogSheet>
        <span className="max-short:ml-auto"><BoardMenu /></span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 lg:flex-row lg:gap-3 lg:p-3 short:flex-row short:gap-2 short:p-2">
        <main className="flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-1 overflow-x-clip overflow-y-auto [scrollbar-width:none]">
          <div className="flex items-center justify-center gap-2 short:hidden">
            <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">Opp hand</span>
            <div className="flex">{Array.from({ length: opp.hand }, (_, i) => <Back key={i} className="-ml-2 w-6 first:ml-0 lg:w-8" />)}</div>
            <span className="text-xs font-bold text-muted-foreground">{opp.hand}</span>
          </div>
          <Mat foe side={opp} trashCard={opp.chars[0]} going="Going 2nd" />
          <Mat side={me} trashCard={me.hand[0]} going="Going 1st" />
          <div className="short:hidden">
            <div className="flex items-center justify-between px-1 pt-1.5">
              <h2 className="font-heading text-base font-semibold">Hand <span className="text-muted-foreground">{me.hand.length}</span></h2>
              <div className="flex gap-1.5"><Button variant="outline" size="xs">Sort</Button><Button variant="outline" size="xs">Hide</Button></div>
            </div>
            <Hand cards={me.hand} />
          </div>
        </main>

        {/* Phone portrait / tablet: slim action bar */}
        <aside className="flex shrink-0 items-center gap-2 lg:hidden short:hidden">
          <LogSheet><Button variant="outline" size="lg" className="mr-auto shrink-0"><ScrollText /> Log <Badge variant="secondary" className="ml-0.5">{LOG.length}</Badge></Button></LogSheet>
          <p className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground sm:block">Select a card for actions</p>
          <Button variant="outline" size="lg" className="shrink-0"><Swords /> Attack</Button>
          <Button size="lg" className="h-9 shrink-0 px-5">End turn</Button>
        </aside>

        {/* Desktop side column */}
        <aside className="hidden min-h-0 w-80 shrink-0 flex-col gap-3 lg:flex short:hidden">
          <Card size="sm" className="ring-primary/40">
            <CardContent className="flex flex-col items-center gap-2 text-center">
              <div className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">Turn {board.turn}</div>
              <div className="font-heading text-2xl leading-none font-bold text-primary">Your turn</div>
              <PhaseStrip />
            </CardContent>
          </Card>
          <div className="flex flex-col gap-2"><PlayerRow foe /><PlayerRow /></div>
          <Actions />
          <Card size="sm" className="min-h-0 flex-1">
            <CardHeader><CardTitle className="text-xs tracking-widest text-primary uppercase">Recent plays</CardTitle><CardAction className="text-xs text-muted-foreground">{LOG.length}</CardAction></CardHeader>
            <ScrollArea className="min-h-0 flex-1 px-3"><LogList /><div className="h-3" /></ScrollArea>
          </Card>
        </aside>

        {/* Phone landscape side column: turn, hand, End turn */}
        <aside className="hidden min-h-0 w-[196px] shrink-0 flex-col gap-2 short:flex">
          <Card size="sm" className="gap-1 ring-primary/40 [--card-spacing:--spacing(2)]">
            <CardContent className="flex flex-col items-center gap-1.5 text-center">
              <div className="font-heading text-lg leading-none font-bold text-primary">Your turn</div>
              <PhaseStrip small />
            </CardContent>
          </Card>
          <div className="flex items-center justify-between px-0.5"><h2 className="font-heading text-sm font-semibold">Hand <span className="text-muted-foreground">{me.hand.length}</span></h2><span className="text-[10px] font-bold text-muted-foreground uppercase">Sort</span></div>
          <Hand cards={me.hand} grid />
          <div className="mt-auto"><Actions compact /></div>
        </aside>
      </div>
    </div>
  );
}
