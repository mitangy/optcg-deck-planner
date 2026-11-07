import { useEffect, useMemo, useState } from "react";
import { CardView, money } from "../../api";
import { deckRemainingMarket } from "../../deckCost";

/* v2: default-closed public link (resets older localStorage "open" so mobile chrome stays shorter). */
const DECK_PROGRESS_MODE_KEY = "optcg_deck_progress_mode";

type DeckProgressMode = "copies" | "uniques";

function summarizeDeckProgress(cards: CardView[]) {
  const uniqueTotal = cards.length;
  const uniqueComplete = cards.filter((c) => c.still_need === 0).length;
  const uniqueStill = uniqueTotal - uniqueComplete;
  const copiesNeeded = cards.reduce((sum, c) => sum + c.needed, 0);
  const copiesStill = cards.reduce((sum, c) => sum + c.still_need, 0);
  const copiesOwned = copiesNeeded - copiesStill;
  const remainingMarket = deckRemainingMarket(cards);
  return {
    uniqueTotal,
    uniqueComplete,
    uniqueStill,
    copiesNeeded,
    copiesStill,
    copiesOwned,
    remainingMarket,
  };
}

function useDeckProgressMode() {
  const [mode, setMode] = useState<DeckProgressMode>(() => {
    try {
      return localStorage.getItem(DECK_PROGRESS_MODE_KEY) === "uniques" ? "uniques" : "copies";
    } catch {
      return "copies";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(DECK_PROGRESS_MODE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, [mode]);
  return [mode, setMode] as const;
}

export function DeckProgressSummary({ cards }: { cards: CardView[] }) {
  const [mode, setMode] = useDeckProgressMode();
  const stats = useMemo(() => summarizeDeckProgress(cards), [cards]);
  const owned = mode === "copies" ? stats.copiesOwned : stats.uniqueComplete;
  const total = mode === "copies" ? stats.copiesNeeded : stats.uniqueTotal;
  const still = mode === "copies" ? stats.copiesStill : stats.uniqueStill;
  const pct = total > 0 ? Math.round((owned / total) * 100) : 100;
  const meta =
    stats.copiesStill > 0
      ? mode === "uniques"
        ? `${stats.copiesStill} copies left · ${money(stats.remainingMarket)} left`
        : `${money(stats.remainingMarket)} left`
      : "Deck complete";

  return (
    <div className="deck-progress">
      <div className="deck-progress-head">
        <div className="deck-progress-toggle" role="group" aria-label="Progress count mode">
          <button
            type="button"
            className={mode === "copies" ? "active" : ""}
            aria-pressed={mode === "copies"}
            onClick={() => setMode("copies")}
          >
            Copies
          </button>
          <button
            type="button"
            className={mode === "uniques" ? "active" : ""}
            aria-pressed={mode === "uniques"}
            onClick={() => setMode("uniques")}
          >
            Uniques
          </button>
        </div>
        <p className="deck-progress-text">
          <span className="deck-progress-line">
            <strong>
              {owned}/{total}
            </strong>{" "}
            {mode === "copies" ? "copies owned" : "uniques complete"} · <strong>{still}</strong> still needed
          </span>
          <span className="deck-progress-line deck-progress-meta">{meta}</span>
        </p>
      </div>
      <div
        className="deck-progress-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={`${pct}% of deck ${mode === "copies" ? "copies" : "uniques"} owned`}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
