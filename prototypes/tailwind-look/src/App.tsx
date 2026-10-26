import { useEffect, useState } from "react";
import PlannerDeck from "./planner/PlannerDeck";
import PlannerCollection from "./planner/PlannerCollection";
import DuelHome from "./duel/DuelHome";
import DuelDecks from "./duel/DuelDecks";
import DuelBoard from "./duel/DuelBoard";

/** Hash routes so the screenshot script can open each screen directly: #/planner/deck etc. */
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
  // Each app has its own page background; the duel screens are dark.
  useEffect(() => {
    document.documentElement.dataset.app = path.startsWith("/duel") ? "duel" : "planner";
  }, [path]);
  const Screen = ROUTES[path] ?? PlannerDeck;
  return <Screen />;
}
