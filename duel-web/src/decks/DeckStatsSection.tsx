import { useMemo, useState } from "react";
import { hintAsk, useLogPoseAsk } from "@optcg/analyst-client";
import type { DeckHint, DeckStatsCard } from "@optcg/deck-analytics";
import { DeckStatsPanel, useDeckHints } from "@optcg/deck-analytics/ui";
import "@optcg/deck-analytics/ui/deckAnalytics.css";
import type { SavedDeck } from "./storage";

const OPEN_KEY = "optcg-duel:deck-stats-open";

/** Copies per card id, in first-seen order (the planner's stats input shape). */
export function deckStatsCards(cards: readonly string[]): DeckStatsCard[] {
  const copies = new Map<string, number>();
  for (const id of cards) copies.set(id, (copies.get(id) ?? 0) + 1);
  return [...copies].map(([id, n]) => ({ id, copies: n }));
}

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * The planner's deck stats, draw odds, searchers and build hints, folded behind a heading
 * in the deck editor. Rule breaks are hints only; nothing here blocks an edit.
 */
export function DeckStatsSection({ deck }: { deck: SavedDeck }) {
  const cards = useMemo(() => deckStatsCards(deck.cards), [deck.cards]);
  // The editor is always mid-edit, so the 50-card count stays quiet until the deck goes over.
  const baseHints = useDeckHints(deck.id, cards, deck.leaderId, false);
  // "Why? Ask Log Pose" on a hint, only while Log Pose can answer here.
  const askLogPose = useLogPoseAsk();
  const hints = useMemo(
    () => (askLogPose ? { ...baseHints, onAsk: (h: DeckHint) => askLogPose(hintAsk(h)) } : baseHints),
    [baseHints, askLogPose],
  );
  const [open, setOpen] = useState(readOpen);
  const count = hints.visible.length;

  return (
    <details
      className="deck-config-section deck-collapsible deck-stats-section"
      open={open}
      onToggle={(e) => {
        const next = e.currentTarget.open;
        setOpen(next);
        try {
          localStorage.setItem(OPEN_KEY, next ? "1" : "0");
        } catch {
          /* ignore */
        }
      }}
    >
      <summary className="deck-collapsible-summary">
        <h2 className="lobby-section-title">Deck stats</h2>
        {/* Always rendered so the heading never shifts when hints come and go. */}
        <span className={`deck-stats-badge${count ? "" : " is-empty"}`} aria-label={count ? `${count} build hints` : undefined}>
          {count || ""}
        </span>
      </summary>
      {open ? (
        <div className="deck-collapsible-body deck-stats duel-deck-stats">
          <DeckStatsPanel cards={cards} leaderId={deck.leaderId} hints={hints} />
        </div>
      ) : null}
    </details>
  );
}
