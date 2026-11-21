import { useMemo, useState } from "react";
import { MoreHorizontal, Search, Plus, Upload, TriangleAlert } from "lucide-react";
import { duelDecks, type Deck } from "../shared/data";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ColorDot, PageShell } from "./shell";

const SORTS = ["Recently played", "Win rate", "Name"] as const;
type Sort = (typeof SORTS)[number];
const rate = (d: Deck) => d.wins / Math.max(1, d.wins + d.losses);

function DeckCard({ d }: { d: Deck }) {
  const pct = Math.round(rate(d) * 100);
  return (
    <Card className={`group/deck gap-0 py-0 transition hover:ring-primary/50 ${d.valid ? "" : "ring-destructive/60"}`}>
      <div className="relative h-32 shrink-0 overflow-hidden bg-background">
        <img src={d.leader.image} alt={d.leader.name} className="absolute inset-0 size-full object-cover object-[50%_22%] transition duration-300 group-hover/deck:scale-110" />
        <div className="absolute inset-0 bg-linear-to-t from-card via-card/20 to-transparent" />
        <div className="absolute top-2 right-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="icon" aria-label="Deck actions" className="bg-background/70 backdrop-blur"><MoreHorizontal /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>Edit</DropdownMenuItem>
              <DropdownMenuItem>Duplicate</DropdownMenuItem>
              <DropdownMenuItem>Play</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="absolute bottom-2 left-3 flex gap-1">{d.leader.colors.map((c) => <ColorDot key={c} color={c} className="size-3.5" />)}</div>
      </div>
      <CardContent className="flex min-w-0 flex-1 flex-col gap-3 py-3">
        <div className="min-w-0">
          <h3 className="truncate font-heading text-lg leading-tight font-semibold">{d.name}</h3>
          <p className="truncate text-xs text-muted-foreground">{d.leader.name}</p>
        </div>
        {!d.valid && (
          <Alert variant="destructive" className="py-2">
            <TriangleAlert />
            <AlertDescription className="text-xs">Not legal: 5 copies of OP06-094</AlertDescription>
          </Alert>
        )}
        <div className="mt-auto grid grid-cols-2 gap-3 text-xs">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">Cards</span>
            <span className="font-semibold">{d.size}<span className="text-muted-foreground">/50</span></span>
            <Progress value={(d.size / 50) * 100} className="h-1" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">Record</span>
            <span className="font-semibold"><span className="text-chart-4">{d.wins}W</span> <span className="text-destructive">{d.losses}L</span> <span className="font-normal text-muted-foreground">· {pct}%</span></span>
            <Progress value={pct} className="h-1" />
          </div>
        </div>
        <div className="flex items-center justify-between border-t pt-2.5 text-[11px] text-muted-foreground">
          <span>Updated {d.updated}</span>
          <Button asChild variant="link" size="xs" className="h-auto p-0"><a href="#/duel/board">Play →</a></Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DuelDecks() {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("Recently played");
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
          <h1 className="font-heading text-4xl font-bold text-primary">Decks</h1>
          <p className="text-sm text-muted-foreground">Choose a deck to edit, or create a new one.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline">Meta decks</Button>
          <Button variant="outline"><Upload /> Import</Button>
          <Button><Plus /> New deck</Button>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-3">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search decks or leaders" className="h-9 pl-9" />
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
          <SelectTrigger className="h-9 min-w-44"><span className="text-muted-foreground">Sort:</span><SelectValue /></SelectTrigger>
          <SelectContent align="end">{SORTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <ul className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        {list.map((d) => <li key={d.name} className="flex min-w-0 flex-col [&>*]:flex-1"><DeckCard d={d} /></li>)}
        <li className="flex min-h-40 flex-col items-center justify-center gap-1 rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
          <span className="text-xs font-semibold tracking-widest text-primary uppercase">From your planner</span>
          Planner decks appear after <a className="font-semibold text-primary underline underline-offset-2" href="#/duel/home">signing in with Google</a>.
        </li>
      </ul>
    </PageShell>
  );
}
