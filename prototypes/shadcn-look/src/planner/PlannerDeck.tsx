import { ChevronDown, Filter, LayoutGrid, List, MoreHorizontal, Search, Share2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { plannerDeck, type Card as CardT } from "../shared/data";
import DeckStats from "./DeckStats";
import { ColorChip, CostChip, NeedBadge, Page, PricePopover, Stepper, TypeBadge, money } from "./parts";

type SortId = "cost" | "need" | "price" | "name";
const SORTS: { id: SortId; label: string }[] = [
  { id: "cost", label: "Cost" },
  { id: "need", label: "Still needed" },
  { id: "price", label: "Price" },
  { id: "name", label: "Name" },
];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const thumb = "shrink-0 rounded-md border object-cover";

export default function PlannerDeck() {
  const { leader, cards, name, event, placing, players } = plannerDeck;
  const [owned, setOwned] = useState<Record<string, number>>(() => Object.fromEntries(cards.map((c) => [c.id, c.owned ?? 0])));
  const [view, setView] = useState("list");
  const [mode, setMode] = useState("copies");
  const [sort, setSort] = useState<SortId>("cost");
  const [q, setQ] = useState("");
  const [onlyNeed, setOnlyNeed] = useState(false);
  const [types, setTypes] = useState<Record<string, boolean>>({ character: true, event: true, stage: true });

  const need = (c: CardT) => Math.max(0, (c.count ?? 0) - (owned[c.id] ?? 0));
  const totals = useMemo(() => {
    const total = cards.reduce((n, c) => n + (c.count ?? 0), 0);
    const have = cards.reduce((n, c) => n + Math.min(c.count ?? 0, owned[c.id] ?? 0), 0);
    const cost = cards.reduce((n, c) => n + Math.max(0, (c.count ?? 0) - (owned[c.id] ?? 0)) * (c.price ?? 0), 0);
    return { total, have, cost, uTotal: cards.length, uHave: cards.filter((c) => (owned[c.id] ?? 0) >= (c.count ?? 0)).length };
  }, [owned, cards]);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const n = (c: CardT) => Math.max(0, (c.count ?? 0) - (owned[c.id] ?? 0));
    const by: Record<SortId, (a: CardT, b: CardT) => number> = {
      cost: (a, b) => (a.cost ?? 0) - (b.cost ?? 0) || a.name.localeCompare(b.name),
      need: (a, b) => n(b) - n(a),
      price: (a, b) => (b.price ?? 0) - (a.price ?? 0),
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return cards
      .filter((c) => (!t || c.name.toLowerCase().includes(t) || c.id.toLowerCase().includes(t)) && (!onlyNeed || n(c) > 0) && types[c.type ?? ""] !== false)
      .sort(by[sort]);
  }, [cards, q, onlyNeed, types, sort, owned]);

  const uniq = mode === "uniques";
  const [have, all] = uniq ? [totals.uHave, totals.uTotal] : [totals.have, totals.total];
  const pct = Math.round((have / all) * 100);
  const setOwn = (id: string) => (n: number) => setOwned((o) => ({ ...o, [id]: n }));
  const activeFilters = (onlyNeed ? 1 : 0) + Object.values(types).filter((v) => !v).length;

  return (
    <Page active="Decks">
      {/* Leader header */}
      <section className="flex gap-4 sm:gap-6">
        <img src={leader.image} alt={leader.name} loading="eager" className="h-[134px] w-24 shrink-0 rounded-lg border object-cover shadow-md sm:h-[168px] sm:w-[120px]" />
        <div className="min-w-0 flex-1 self-center">
          <a href="#/planner/deck" className="text-xs font-medium text-muted-foreground hover:underline">← Decks</a>
          <h1 className="mt-1 font-heading text-3xl leading-tight font-semibold sm:text-4xl">{name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Leader {leader.id} · {leader.name}</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {leader.colors.map((c) => <ColorChip key={c} color={c} />)}
            <Badge variant="secondary" className="h-auto max-w-full py-0.5 whitespace-normal">{event} · #{placing} of {players}</Badge>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button>Edit deck</Button>
            <Button asChild variant="outline"><a href="#/duel/decks">Play in Duel</a></Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost"><Share2 /> Share <ChevronDown /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {["Copy share link", "Export decklist", "Print proxies"].map((i) => <DropdownMenuItem key={i}>{i}</DropdownMenuItem>)}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="More"><MoreHorizontal /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {["Rename deck", "Duplicate", "Hide from friends"].map((i) => <DropdownMenuItem key={i}>{i}</DropdownMenuItem>)}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive">Delete deck</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </section>

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
          {/* Phone stats */}
          <Collapsible className="lg:hidden">
            <Card className="gap-0 py-0">
              <CollapsibleTrigger className="group flex w-full items-center justify-between px-4 py-3 text-left font-heading text-lg font-semibold">
                Deck stats <ChevronDown className="size-4 text-muted-foreground transition group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent><div className="border-t p-4"><DeckStats cards={cards} /></div></CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Progress */}
          <Card>
            <CardContent className="grid gap-x-8 gap-y-4 md:grid-cols-[1fr_auto] md:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <Tabs value={mode} onValueChange={setMode}>
                    <TabsList>
                      <TabsTrigger value="copies" className="px-3">Copies</TabsTrigger>
                      <TabsTrigger value="uniques" className="px-3">Uniques</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <p className="text-sm">
                    <span className="font-heading text-2xl font-semibold tabular-nums">{have}</span>
                    <span className="text-muted-foreground"> / {all} {uniq ? "uniques" : "copies"} owned</span>
                    <span className="mx-2 text-border">·</span>
                    <span className="font-semibold">{all - have}</span> still needed
                  </p>
                </div>
                <Progress value={pct} className="mt-3 h-2.5" aria-label="Deck completion" />
              </div>
              <div className="md:border-l md:pl-8">
                <p className="text-xs font-medium text-muted-foreground">Cost to complete</p>
                <p className="font-heading text-2xl font-semibold tabular-nums">{money(totals.cost)}</p>
              </div>
            </CardContent>
          </Card>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 basis-full sm:basis-64">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, ID…" aria-label="Search deck" className="h-9 pl-8" />
            </div>
            <Select value={sort} onValueChange={(v) => setSort(v as SortId)}>
              <SelectTrigger className="h-9 w-36" aria-label="Sort"><span className="text-muted-foreground">Sort</span><SelectValue /></SelectTrigger>
              <SelectContent>{SORTS.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-9">
                  <Filter /> Filters
                  {activeFilters > 0 && <Badge className="h-4 min-w-4 px-1">{activeFilters}</Badge>}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuCheckboxItem checked={onlyNeed} onCheckedChange={setOnlyNeed} onSelect={(e) => e.preventDefault()}>Still needed only</DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Card types</DropdownMenuLabel>
                {Object.keys(types).map((t) => (
                  <DropdownMenuCheckboxItem key={t} checked={types[t]} onCheckedChange={(v) => setTypes((o) => ({ ...o, [t]: !!v }))} onSelect={(e) => e.preventDefault()}>{cap(t)}s</DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <ToggleGroup type="single" variant="outline" value={view} onValueChange={(v) => v && setView(v)} spacing={0} className="ml-auto" aria-label="View">
              <ToggleGroupItem value="list" aria-label="List view" className="h-9 px-3"><List /><span className="hidden sm:inline">List</span></ToggleGroupItem>
              <ToggleGroupItem value="grid" aria-label="Grid view" className="h-9 px-3"><LayoutGrid /><span className="hidden sm:inline">Grid</span></ToggleGroupItem>
            </ToggleGroup>
          </div>

          <h2 className="flex items-baseline gap-3 font-heading text-2xl font-semibold">
            Deck list <span className="font-sans text-sm font-normal text-muted-foreground">{rows.length} cards</span>
          </h2>

          {view === "list" ? (
            <>
              {/* Desktop table */}
              <Card className="hidden gap-0 overflow-hidden py-0 md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="pl-4">Card</TableHead>
                      <TableHead className="w-36">Type · Cost</TableHead>
                      <TableHead className="w-32">Owned</TableHead>
                      <TableHead className="w-28">Need</TableHead>
                      <TableHead className="w-28 pr-4 text-right">Market</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="max-w-0 pl-4">
                          <div className="flex min-w-0 items-center gap-3">
                            <img src={c.image} alt="" loading="eager" className={`${thumb} h-[70px] w-[50px]`} />
                            <div className="min-w-0">
                              <p className="truncate font-medium">{c.name}</p>
                              <p className="text-xs text-muted-foreground tabular-nums">{c.id} · ×{c.count} in deck</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell><div className="flex items-center gap-1.5"><TypeBadge type={c.type} /><CostChip cost={c.cost} /></div></TableCell>
                        <TableCell><Stepper value={owned[c.id] ?? 0} onChange={setOwn(c.id)} label={`${c.name} owned`} /></TableCell>
                        <TableCell><NeedBadge need={need(c)} /></TableCell>
                        <TableCell className="pr-3 text-right"><PricePopover price={c.price ?? 0} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
              {/* Phone stacked rows */}
              <Card className="gap-0 py-0 md:hidden">
                <ul className="divide-y">
                  {rows.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3">
                      <div className="flex min-w-0 basis-full items-center gap-3">
                        <img src={c.image} alt="" loading="eager" className={`${thumb} h-[70px] w-[50px]`} />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{c.name}</p>
                          <p className="text-xs text-muted-foreground tabular-nums">{c.id} · ×{c.count} in deck</p>
                          <div className="mt-1 flex items-center gap-1.5"><TypeBadge type={c.type} /><CostChip cost={c.cost} /></div>
                        </div>
                      </div>
                      <Stepper value={owned[c.id] ?? 0} onChange={setOwn(c.id)} label={`${c.name} owned`} />
                      <NeedBadge need={need(c)} />
                      <PricePopover price={c.price ?? 0} className="ml-auto" />
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {rows.map((c) => (
                <li key={c.id}>
                  <Card className="gap-0 p-2.5">
                    <div className="relative">
                      <img src={c.image} alt={c.name} loading="eager" className={`${thumb} aspect-[5/7] w-full`} />
                      <Badge className="absolute top-1.5 right-1.5 tabular-nums">×{c.count}</Badge>
                      <CostChip cost={c.cost} className="absolute top-1.5 left-1.5" />
                    </div>
                    <p className="mt-2 truncate text-sm font-medium" title={c.name}>{c.name}</p>
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-1">
                      <NeedBadge need={need(c)} />
                      <PricePopover price={c.price ?? 0} />
                    </div>
                    <div className="mt-2"><Stepper value={owned[c.id] ?? 0} onChange={setOwn(c.id)} label={`${c.name} owned`} /></div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="sticky top-[72px] hidden lg:block">
          <Card>
            <CardContent>
              <h2 className="mb-3 font-heading text-lg font-semibold">Deck stats</h2>
              <DeckStats cards={cards} />
            </CardContent>
          </Card>
        </aside>
      </div>
    </Page>
  );
}
