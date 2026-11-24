import { useMemo, useState } from "react";
import { hintAsk, useLogPoseAsk } from "@optcg/analyst-client";
import type { DeckHint, DeckStatsCard } from "@optcg/deck-analytics";
import { DeckStatsPanel, useDeckHints } from "@optcg/deck-analytics/ui";
import "@optcg/deck-analytics/ui/deckAnalytics.css";
import type { SavedDeck } from "./storage";
import { readStored, writeStored } from "@optcg/ui/storage";

const OPEN_KEY = "optcg-duel:deck-stats-open";

export function deckStatsCards(cards: readonly string[]): DeckStatsCard[] {
  const copies = new Map<string, number>();
  for (const id of cards) copies.set(id, (copies.get(id) ?? 0) + 1);
  return [...copies].map(([id, n]) => ({ id, copies: n }));
}

function readOpen(): boolean {
  return readStored(OPEN_KEY) === "1";
}

/** With `panel` the stats show as a plain section (opened from a button) instead of a collapsible one. */
export function DeckStatsSection({ deck, panel = false }: { deck: SavedDeck; panel?: boolean }) {
  const cards = useMemo(() => deckStatsCards(deck.cards), [deck.cards]);
  const baseHints = useDeckHints(deck.id, cards, deck.leaderId, false);
  const askLogPose = useLogPoseAsk();
  const hints = useMemo(
    () => (askLogPose ? { ...baseHints, onAsk: (h: DeckHint) => askLogPose(hintAsk(h)) } : baseHints),
    [baseHints, askLogPose],
  );
  const [open, setOpen] = useState(readOpen);
  const count = hints.visible.length;

  if (panel) {
    return (
      <section className="deck-config-section deck-stats-section">
        <h2 className="lobby-section-title">Deck stats</h2>
        <div className="deck-stats duel-deck-stats">
          <DeckStatsPanel cards={cards} leaderId={deck.leaderId} hints={hints} />
        </div>
      </section>
    );
  }

  return (
    <details
      className="deck-config-section deck-collapsible deck-stats-section"
      open={open}
      onToggle={(e) => {
        const next = e.currentTarget.open;
        setOpen(next);
        writeStored(OPEN_KEY, next ? "1" : "0");
      }}
    >
      <summary className="deck-collapsible-summary">
        <h2 className="lobby-section-title">Deck stats</h2>
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
