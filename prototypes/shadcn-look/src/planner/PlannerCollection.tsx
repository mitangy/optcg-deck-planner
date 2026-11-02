import { LayoutGrid, List, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { collection } from "../shared/data";
import { COLOR_NAMES, ColorChip, ColorDot, CostChip, Page, PricePopover, TypeBadge, money } from "./parts";

const TYPES = ["all", "leader", "character", "event", "stage"];
const SORTS = ["Value", "Copies", "Cost", "Name"] as const;
type Sort = (typeof SORTS)[number];
const thumb = "shrink-0 rounded-md border object-cover";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="min-w-0 gap-0 py-3 sm:py-4">
      <CardContent className="px-4 sm:px-6">
        <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-0.5 font-heading text-2xl font-semibold tabular-nums sm:text-3xl">{value}</p>
      </CardContent>
    </Card>
  );
}

export default function PlannerCollection() {
  const [q, setQ] = useState("");
  const [color, setColor] = useState("");
  const [type, setType] = useState("all");
  const [view, setView] = useState("grid");
  const [sort, setSort] = useState<Sort>("Value");

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

  return (
    <Page active="Collection">
      <p className="text-xs font-medium text-muted-foreground">Cards you own</p>
      <h1 className="font-heading text-4xl font-semibold">Collection</h1>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Stat label="Unique" value={stats.unique} />
        <Stat label="Copies" value={stats.copies} />
        <Stat label="Est. value" value={money(stats.value)} />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-full sm:basis-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, ID…" aria-label="Search collection" className="h-9 pl-8" />
        </div>
        <ToggleGroup type="single" variant="outline" value={color} onValueChange={setColor} aria-label="Colour" spacing={1} className="flex-wrap">
          {COLOR_NAMES.map((c) => (
            <ToggleGroupItem key={c} value={c} aria-label={c} className="size-9 rounded-full data-[state=on]:border-ring data-[state=on]:bg-accent data-[state=on]:ring-2 data-[state=on]:ring-ring/50">
              <ColorDot color={c} className="size-4" />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ToggleGroup type="single" variant="outline" value={type} onValueChange={(v) => v && setType(v)} aria-label="Type" spacing={1} className="min-w-0 flex-wrap">
          {TYPES.map((t) => (
            <ToggleGroupItem key={t} value={t} className="rounded-full px-2.5 capitalize data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
              {t === "all" ? "All" : t}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="ml-auto flex items-center gap-2">
          <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
            <SelectTrigger className="h-9 w-36" aria-label="Sort"><span className="text-muted-foreground">Sort</span><SelectValue /></SelectTrigger>
            <SelectContent>{SORTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
          <ToggleGroup type="single" variant="outline" value={view} onValueChange={(v) => v && setView(v)} spacing={0} aria-label="View">
            <ToggleGroupItem value="list" aria-label="List view" className="h-9 px-3"><List /><span className="hidden sm:inline">List</span></ToggleGroupItem>
            <ToggleGroupItem value="grid" aria-label="Grid view" className="h-9 px-3"><LayoutGrid /><span className="hidden sm:inline">Grid</span></ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      <p className="mt-5 mb-2.5 text-sm text-muted-foreground">{rows.length} of {collection.length} cards</p>

      {rows.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No owned cards match those filters.</CardContent></Card>
      ) : view === "list" ? (
        <>
          <Card className="hidden gap-0 overflow-hidden py-0 md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="pl-4">Card</TableHead>
                  <TableHead className="w-36">Type · Cost</TableHead>
                  <TableHead className="w-24">Owned</TableHead>
                  <TableHead className="w-28">Value</TableHead>
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
                          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground tabular-nums">{c.id}{c.colors.map((x) => <ColorChip key={x} color={x} />)}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><div className="flex items-center gap-1.5"><TypeBadge type={c.type} />{c.type !== "leader" && <CostChip cost={c.cost} />}</div></TableCell>
                    <TableCell><Badge className="tabular-nums">×{c.owned}</Badge></TableCell>
                    <TableCell className="font-heading text-base font-semibold tabular-nums">{money((c.owned ?? 0) * (c.price ?? 0))}</TableCell>
                    <TableCell className="pr-3 text-right"><PricePopover price={c.price ?? 0} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <Card className="gap-0 py-0 md:hidden">
            <ul className="divide-y">
              {rows.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3">
                  <div className="flex min-w-0 basis-full items-center gap-3">
                    <img src={c.image} alt="" loading="eager" className={`${thumb} h-[70px] w-[50px]`} />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">{c.id}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">{c.colors.map((x) => <ColorChip key={x} color={x} />)}</div>
                    </div>
                  </div>
                  <TypeBadge type={c.type} />
                  {c.type !== "leader" && <CostChip cost={c.cost} />}
                  <Badge className="tabular-nums">×{c.owned}</Badge>
                  <span className="font-heading font-semibold tabular-nums">{money((c.owned ?? 0) * (c.price ?? 0))}</span>
                  <PricePopover price={c.price ?? 0} className="ml-auto" />
                </li>
              ))}
            </ul>
          </Card>
        </>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {rows.map((c) => (
            <li key={c.id} className="min-w-0">
              <Card className="gap-0 p-2">
                <div className="relative">
                  <img src={c.image} alt={c.name} loading="eager" className={`${thumb} aspect-[5/7] w-full`} />
                  <Badge className="absolute -top-1.5 -right-1.5 border-2 border-card tabular-nums">×{c.owned}</Badge>
                  {c.type !== "leader" && <CostChip cost={c.cost} className="absolute bottom-1.5 left-1.5" />}
                </div>
                <p className="mt-2 truncate text-[13px] font-medium" title={c.name}>{c.name}</p>
                <div className="mt-0.5 flex items-center justify-between gap-1">
                  <span className="truncate text-[11px] text-muted-foreground tabular-nums">{c.id}</span>
                  <PricePopover price={c.price ?? 0} />
                </div>
                <div className="mt-1 flex flex-wrap gap-1">{c.colors.slice(0, 2).map((x) => <ColorChip key={x} color={x} />)}</div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
