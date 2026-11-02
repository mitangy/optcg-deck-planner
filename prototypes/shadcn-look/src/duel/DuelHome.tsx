import { useState } from "react";
import { Bot, Swords, Monitor, DoorOpen, Check } from "lucide-react";
import { duelDecks } from "../shared/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarBadge, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ColorDot, PageShell } from "./shell";

const MODES = [
  { title: "Play vs Bot", sub: "Casual, never ranked", icon: Bot },
  { title: "Ranked", sub: "15 min each · earns Bounty", icon: Swords },
  { title: "Practice", sub: "Both sides on this device", icon: Monitor },
];
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
      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="relative">
            <CardContent className="flex min-w-0 items-center gap-4 sm:gap-6">
              <img src={deck.leader.image} alt={deck.leader.name} className="aspect-[63/88] w-24 shrink-0 -rotate-3 rounded-lg shadow-xl ring-1 ring-primary/40 sm:w-36" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-xs font-semibold tracking-widest text-primary uppercase">Sailing with</span>
                <h1 className="truncate font-heading text-3xl font-bold sm:text-4xl">{deck.name}</h1>
                <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                  <span className="flex gap-1">{deck.leader.colors.map((c) => <ColorDot key={c} color={c} />)}</span>
                  <span className="min-w-0 truncate">{deck.leader.name}</span>
                </p>
                <p className="text-sm text-muted-foreground">{deck.size} cards · <span className="text-chart-4">{deck.wins}W</span> <span className="text-destructive">{deck.losses}L</span></p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm"><a href="#/duel/decks">Change deck</a></Button>
                  <Button asChild variant="ghost" size="sm" className="text-muted-foreground"><a href="#/duel/decks">Edit deck</a></Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Button asChild size="lg" className="h-auto flex-col gap-0 rounded-xl py-4">
            <a href="#/duel/board"><span className="font-heading text-3xl font-bold leading-none">Play</span><span className="mt-1 text-sm font-medium opacity-75">Choose a mode</span></a>
          </Button>

          <section className="grid min-w-0 grid-cols-3 gap-2 sm:gap-3">
            {MODES.map((m) => (
              <Card key={m.title} size="sm" className="min-w-0 cursor-pointer transition hover:ring-primary/50">
                <CardContent className="flex min-w-0 flex-col items-center gap-2 text-center sm:flex-row sm:gap-3 sm:text-left">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary"><m.icon className="size-5" /></span>
                  <span className="min-w-0">
                    <span className="block font-heading text-sm leading-tight font-semibold sm:text-base">{m.title}</span>
                    <span className="hidden truncate text-xs text-muted-foreground sm:block">{m.sub}</span>
                  </span>
                </CardContent>
              </Card>
            ))}
            <Card size="sm" className="col-span-3 min-w-0">
              <CardContent className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 items-center gap-3 sm:flex-1">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary"><DoorOpen className="size-5" /></span>
                  <span className="min-w-0">
                    <span className="block font-heading font-semibold">Casual room</span>
                    <span className="block text-xs text-muted-foreground">Create one, or join with a friend&apos;s code.</span>
                  </span>
                </div>
                <div className="flex min-w-0 gap-2">
                  <Input aria-label="Room code" placeholder="ROOM CODE" className="h-9 min-w-0 flex-1 text-center font-mono tracking-[0.25em] uppercase sm:w-36 sm:flex-none" />
                  <Button variant="outline" className="h-9 shrink-0">Join</Button>
                  <Button variant="secondary" className="h-9 shrink-0">Create</Button>
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="min-w-0">
            <div className="mb-2 flex items-end justify-between">
              <h2 className="text-xs font-semibold tracking-widest text-primary uppercase">Your decks</h2>
              <Button asChild variant="link" size="sm" className="h-auto p-0"><a href="#/duel/decks">All decks</a></Button>
            </div>
            <ScrollArea className="w-full min-w-0">
              <ul className="flex gap-3 p-1 pb-3">
                {duelDecks.map((d, i) => (
                  <li key={d.name} className="shrink-0">
                    <button
                      onClick={() => setSel(i)}
                      className={`flex w-28 flex-col gap-1.5 rounded-xl p-2 text-left ring-1 transition ${i === sel ? "bg-secondary ring-2 ring-primary" : "bg-card ring-foreground/10 hover:ring-primary/50"}`}
                    >
                      <img src={d.leader.image} alt="" className="aspect-[63/88] w-full rounded-md object-cover" />
                      <span className="truncate text-xs font-semibold">{d.name}</span>
                      <span className="text-[11px] text-muted-foreground">{d.wins}-{d.losses}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-xs tracking-widest text-primary uppercase">Friends online</CardTitle>
              <CardDescription className="sr-only">Friends</CardDescription>
              <div className="col-start-2 row-start-1 justify-self-end"><Badge variant="secondary">3 online</Badge></div>
            </CardHeader>
            <CardContent className="px-0">
              <ul>
                {FRIENDS.map((f, i) => (
                  <li key={f.name}>
                    {i > 0 && <Separator />}
                    <div className="flex min-w-0 items-center gap-3 px-4 py-2.5">
                      <Avatar>
                        <AvatarFallback>{f.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                        <AvatarBadge className={f.on ? "bg-chart-4" : "bg-muted-foreground/50"} />
                      </Avatar>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{f.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{f.status}</span>
                      </span>
                      {f.on && <Button variant="outline" size="sm" className="shrink-0">Invite</Button>}
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xs tracking-widest text-primary uppercase">What&apos;s new</CardTitle>
              <div className="col-start-2 row-start-1 justify-self-end text-xs text-muted-foreground">Patch 0.9.4</div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {NEWS.map((n) => (
                <div key={n.text} className="flex gap-3 text-sm">
                  <Badge variant={n.tag === "New" ? "default" : "secondary"} className="mt-0.5 shrink-0">{n.tag}</Badge>
                  <span className="min-w-0 text-foreground/90">{n.text}</span>
                </div>
              ))}
              <Button variant="ghost" size="sm" className="w-fit text-muted-foreground"><Check /> Mark all read</Button>
            </CardContent>
          </Card>
        </aside>
      </div>
    </PageShell>
  );
}
