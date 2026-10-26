import { useState, type ReactNode } from "react";
import { Menu, Swords, Library, Trophy, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";

/** Card-colour dots are the one place hard-coded hex is fine (they ARE the game's colours). */
export const COLOR_HEX: Record<string, string> = {
  red: "#c4453a", blue: "#3b86c4", green: "#3f9a68", purple: "#8657bd", black: "#474a57", yellow: "#d9b53a",
};
export function ColorDot({ color, className = "" }: { color: string; className?: string }) {
  return <span title={color} style={{ background: COLOR_HEX[color] ?? "#888" }} className={`inline-block size-3 shrink-0 rounded-full ring-1 ring-foreground/30 ${className}`} />;
}

const LINKS = [
  { label: "Play", href: "#/duel/home", icon: Swords },
  { label: "Decks", href: "#/duel/decks", icon: Library },
  { label: "Board demo", href: "#/duel/board", icon: BookOpen },
  { label: "Leaderboard", href: "#/duel/home", icon: Trophy },
];

/** Full-bleed bar; only the inner row is constrained. Phone: Sheet menu. */
export function DuelNav({ active }: { active: string }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 w-full border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:gap-4">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon-lg" aria-label="Open menu" className="md:hidden"><Menu /></Button>
          </SheetTrigger>
          <SheetContent side="left">
            <SheetHeader><SheetTitle className="font-heading text-xl text-primary">OPTCG Duel</SheetTitle></SheetHeader>
            <nav className="flex flex-col gap-1 px-3">
              {LINKS.map((l) => (
                <SheetClose asChild key={l.label}>
                  <Button asChild variant="ghost" size="lg" className={`h-10 justify-start text-base ${l.label === active ? "bg-primary/15 text-primary" : ""}`}>
                    <a href={l.href}><l.icon /> {l.label}</a>
                  </Button>
                </SheetClose>
              ))}
              <Separator className="my-2" />
              <Button asChild variant="ghost" size="lg" className="h-10 justify-start text-base text-muted-foreground"><a href="#/planner/deck">Deck planner</a></Button>
            </nav>
          </SheetContent>
        </Sheet>
        <a href="#/duel/home" className="font-heading text-lg font-bold text-primary sm:text-xl">OPTCG Duel</a>
        <nav className="ml-4 hidden gap-1 md:flex">
          {LINKS.map((l) => (
            <Button key={l.label} asChild variant={l.label === active ? "secondary" : "ghost"}><a href={l.href}>{l.label}</a></Button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="ghost" className="hidden text-muted-foreground lg:inline-flex"><a href="#/planner/deck">Deck planner</a></Button>
          <Avatar><AvatarFallback>MI</AvatarFallback></Avatar>
        </div>
      </div>
    </header>
  );
}

export function PageShell({ active, children }: { active: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh min-w-0 bg-background text-foreground">
      <DuelNav active={active} />
      <main className="mx-auto w-full max-w-6xl min-w-0 px-4 py-5 pb-8 sm:py-6">{children}</main>
    </div>
  );
}
