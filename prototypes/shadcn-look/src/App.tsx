import { useEffect, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import PlannerDeck from "./planner/PlannerDeck";
import PlannerCollection from "./planner/PlannerCollection";
import DuelHome from "./duel/DuelHome";
import DuelDecks from "./duel/DuelDecks";
import DuelBoard from "./duel/DuelBoard";

/** Hash routes (#/planner/deck ...). `?skin=stock` shows shadcn's default theme instead of our palette. */
const ROUTES: Record<string, () => React.JSX.Element> = {
  "/planner/deck": PlannerDeck,
  "/planner/collection": PlannerCollection,
  "/duel/home": DuelHome,
  "/duel/decks": DuelDecks,
  "/duel/board": DuelBoard,
};

export default function App() {
  const [path, setPath] = useState(() => location.hash.slice(1) || "/planner/deck");
  useEffect(() => {
    const on = () => setPath(location.hash.slice(1) || "/planner/deck");
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.skin = new URLSearchParams(location.search).get("skin") === "stock" ? "stock" : "ours";
    root.classList.toggle("dark", path.startsWith("/duel"));
  }, [path]);
  const Screen = ROUTES[path] ?? PlannerDeck;
  return (
    <TooltipProvider>
      <Screen />
    </TooltipProvider>
  );
}
