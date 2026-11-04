/**
 * Move classification for the game review (#967), pure and engine-free so it is easy to test and cheap to ship.
 * A move's loss is how many percentage points of win chance the best option had over the one that was played.
 */

export type MoveClass = "best" | "great" | "excellent" | "good" | "inaccuracy" | "mistake" | "blunder";

/** Every class, best first. */
export const MOVE_CLASSES: readonly MoveClass[] = ["best", "great", "excellent", "good", "inaccuracy", "mistake", "blunder"];

/**
 * All the review's cut-offs, in percentage points of win chance (0..100).
 * A loss up to `best` counts as the best move; up to `excellent` Excellent; and so on; above `mistake` is a Blunder.
 * `greatGap` is how far ahead of every other option a best move must be to be called Great.
 * `goodTurnGain` is the win-probability gain over a turn that makes it a good turn.
 */
export const REVIEW_THRESHOLDS = { best: 1, excellent: 3, good: 7, inaccuracy: 12, mistake: 22, greatGap: 10, goodTurnGain: 8 } as const;

/** Severity for "worst of a turn": best and great are equally fine. */
export const CLASS_SEVERITY: Record<MoveClass, number> = { best: 0, great: 0, excellent: 1, good: 2, inaccuracy: 3, mistake: 4, blunder: 5 };

/** The class for a loss alone (never Great: that needs the other options). */
export function classifyLoss(loss: number): MoveClass {
  const t = REVIEW_THRESHOLDS;
  if (loss <= t.best) return "best";
  if (loss <= t.excellent) return "excellent";
  if (loss <= t.good) return "good";
  if (loss <= t.inaccuracy) return "inaccuracy";
  if (loss <= t.mistake) return "mistake";
  return "blunder";
}

/**
 * Classify a played option among all ranked options' win chances (0..100 points).
 * `others` are the win chances of every option except the played one. Returns the loss (best minus played,
 * never negative) and the class: Great when the played move is best and the next-best other option is at least
 * `greatGap` points worse.
 */
export function classifyMove(playedWin: number, others: readonly number[]): { loss: number; cls: MoveClass } {
  const bestOther = others.length ? Math.max(...others) : -Infinity;
  const loss = Math.max(0, bestOther - playedWin);
  // A gap of at least `greatGap` also means the played move is the top option (zero loss).
  if (others.length && playedWin - bestOther >= REVIEW_THRESHOLDS.greatGap) return { loss, cls: "great" };
  return { loss, cls: classifyLoss(loss) };
}

/** The worse (more severe) of two classes; null is "nothing yet". */
export function worseClass(a: MoveClass | null, b: MoveClass | null): MoveClass | null {
  if (!a) return b;
  if (!b) return a;
  return CLASS_SEVERITY[b] > CLASS_SEVERITY[a] ? b : a;
}

/**
 * Accuracy score of one decision, 0..100: chess.com's curve with the loss in percentage points,
 * 103.17 * exp(-0.0435 * loss) - 3.17, so 100 for no loss, about 63 at a 10-point loss and about 36 at 22.
 */
export function accuracyScore(loss: number): number {
  const v = 103.1668 * Math.exp(-0.04354 * Math.max(0, loss)) - 3.1668;
  return Math.min(100, Math.max(0, v));
}

/**
 * A good turn: nothing at Inaccuracy or worse, and the seat's win probability (0..100 points)
 * grew by at least `goodTurnGain` between this turn's start and the next one's.
 */
export function isGoodTurn(worst: MoveClass | null, winAtStart: number, winAtNextStart: number): boolean {
  if (worst && CLASS_SEVERITY[worst] >= CLASS_SEVERITY.inaccuracy) return false;
  return winAtNextStart - winAtStart >= REVIEW_THRESHOLDS.goodTurnGain;
}

/** JSON with sorted keys, so two intents compare by content (same as the analyst's position matching). */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
