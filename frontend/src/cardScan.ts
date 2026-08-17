/** OCR text → OPTCG card id resolution for the card scanner.
 *
 * Card ids printed on a card face come in two shapes:
 *   OP/ST/EB/PRB + 2 digits + "-" + 3 digits   e.g. OP15-053, PRB01-001
 *   P + "-" + 3 digits (promos)                e.g. P-001
 *
 * DON!! cards use synthetic catalog ids (DON-434340) that are not printed on
 * the card, so they can never be resolved from a scan.
 *
 * Accuracy comes from constraining output to ids that actually exist rather
 * than trusting the raw read: the engine only has to get close enough that
 * shape repair plus a catalog lookup lands on the right id.
 */

/** Set-code prefixes that appear before the two set digits. */
export const SET_PREFIXES = ["OP", "ST", "EB", "PRB"] as const;

/** Promo ids carry a bare "P" and no set digits. */
export const PROMO_PREFIX = "P";

const SET_PREFIX_SET: ReadonlySet<string> = new Set(SET_PREFIXES);

/** Characters Tesseract can produce for this alphabet, as a whitelist. */
export const SCAN_CHAR_WHITELIST = "ABEOPRST0123456789-";

/** Misreads to fix when a position must hold a letter. */
const TO_LETTER: Readonly<Record<string, string>> = {
  "0": "O",
  "5": "S",
  "8": "B",
  "6": "G",
  "1": "I",
  "2": "Z",
};

/** Misreads to fix when a position must hold a digit. */
const TO_DIGIT: Readonly<Record<string, string>> = {
  O: "0",
  D: "0",
  Q: "0",
  U: "0",
  I: "1",
  L: "1",
  T: "1",
  Z: "2",
  A: "4",
  S: "5",
  G: "6",
  B: "8",
};

/** Confidence in a resolved id, highest first. */
export type ScanConfidence = "exact" | "repaired" | "fuzzy";

export type ScanMatch = {
  card_id: string;
  confidence: ScanConfidence;
  /** The raw token the id was derived from, for display and debugging. */
  source: string;
};

/** Collapse unicode dashes, drop noise, and upper-case for matching. */
export function normalizeScanText(raw: string): string {
  return raw
    .toUpperCase()
    // en/em dash, minus, non-breaking hyphen, and common OCR stand-ins
    .replace(/[‐-―−~_]/g, "-")
    // Tesseract often puts spaces around the separator
    .replace(/\s*-\s*/g, "-")
    .replace(/[^A-Z0-9\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toLetter(ch: string): string {
  return TO_LETTER[ch] ?? ch;
}

function toDigit(ch: string): string {
  return TO_DIGIT[ch] ?? ch;
}

/** Single-substitution distance, capped — the prefixes are 2–3 characters. */
function differsByOne(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diffs = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i] && (diffs += 1) > 1) return false;
  }
  return diffs === 1;
}

/**
 * Snap a read prefix onto the closed set of real prefixes.
 *
 * Tesseract confuses letters that no digit/letter rule covers — "OP" comes
 * back as "OR" or "0F". Because only four set prefixes exist, a unique
 * single-character neighbour is a safe correction.
 */
function normalizePrefix(prefix: string): string | null {
  if (SET_PREFIX_SET.has(prefix)) return prefix;
  const near = SET_PREFIXES.filter((p) => differsByOne(p, prefix));
  return near.length === 1 ? near[0] : null;
}

/** Repair the portion before the hyphen into a valid set code, or null. */
function repairSetCode(left: string): string | null {
  if (left.length === 1) {
    return toLetter(left) === PROMO_PREFIX ? PROMO_PREFIX : null;
  }
  // Everything but the trailing two set digits is the alphabetic prefix.
  if (left.length !== 4 && left.length !== 5) return null;
  const splitAt = left.length - 2;
  const prefix = normalizePrefix(left.slice(0, splitAt).split("").map(toLetter).join(""));
  const digits = left.slice(splitAt).split("").map(toDigit).join("");
  if (!prefix) return null;
  if (!/^\d{2}$/.test(digits)) return null;
  return prefix + digits;
}

/** Repair the portion after the hyphen into a 3-digit collector number. */
function repairCollectorNumber(right: string): string | null {
  if (right.length !== 3) return null;
  const digits = right.split("").map(toDigit).join("");
  return /^\d{3}$/.test(digits) ? digits : null;
}

/**
 * Repair one candidate token into a well-formed card id.
 *
 * Returns null when the token cannot be a card id regardless of misreads —
 * which is what keeps set names, effect text, and copyright lines out.
 */
export function repairCardId(token: string): string | null {
  const parts = normalizeScanText(token).split("-");
  if (parts.length !== 2) return null;
  const setCode = repairSetCode(parts[0]);
  const collector = repairCollectorNumber(parts[1]);
  if (!setCode || !collector) return null;
  return `${setCode}-${collector}`;
}

/**
 * Loose token shape: alphanumerics, a separator, then exactly three characters.
 *
 * Nothing may follow the three characters — no word boundary, no digit guard.
 * The rarity badge and cost print flush against the number and land in the
 * read as either letters or digits ("OP11-070SR" → "oP11-070E3", "oP11-07063"),
 * so any trailing constraint rejects real cards. Three is safe to take
 * unconditionally because collector numbers are always exactly three digits.
 */
const CANDIDATE_RE = /\b([A-Z0-9]{1,5})-([A-Z0-9]{3})/g;

/** Pull every plausible card-id token out of a raw OCR read, in order. */
export function extractCardIdTokens(text: string): string[] {
  const normalized = normalizeScanText(text);
  const tokens: string[] = [];
  for (const match of normalized.matchAll(CANDIDATE_RE)) {
    tokens.push(match[0]);
  }
  return tokens;
}

/** Single-substitution neighbours of an id, used as a last resort. */
function fuzzyCandidates(cardId: string, known: ReadonlySet<string>): string[] {
  const hits: string[] = [];
  const digits = "0123456789";
  // Only vary the collector number; the set code is already prefix-validated.
  const [setCode, collector] = cardId.split("-");
  for (let i = 0; i < collector.length; i += 1) {
    for (const d of digits) {
      if (d === collector[i]) continue;
      const candidate = `${setCode}-${collector.slice(0, i)}${d}${collector.slice(i + 1)}`;
      if (known.has(candidate)) hits.push(candidate);
    }
  }
  return hits;
}

/** Words too short or too common to be evidence of a card name. */
const NAME_STOPWORDS = new Set(["THE", "AND", "OF", "DE", "LA"]);

function nameTokens(value: string): string[] {
  return normalizeScanText(value)
    .split(/[^A-Z0-9]+/)
    .filter((t) => t.length >= 3 && !NAME_STOPWORDS.has(t));
}

/**
 * Fraction of a card's name tokens that appear in the OCR read.
 *
 * The card name is printed on the same face as the number, so a read that
 * captures both gives two independent signals. That matters because a digit
 * misread usually lands on another *real* card id, which id validation alone
 * cannot reject.
 */
export function nameOverlapScore(cardName: string, ocrText: string): number {
  const wanted = nameTokens(cardName);
  if (!wanted.length) return 0;
  const haystack = normalizeScanText(ocrText);
  const hits = wanted.filter((t) => haystack.includes(t)).length;
  return hits / wanted.length;
}

/** Name agreement below this is treated as "the name does not match". */
const NAME_MATCH_MIN = 0.5;

/**
 * Resolve a raw OCR read into the best card id it can support.
 *
 * `knownIds` should be every card id in the catalog. Without it the result is
 * shape-validated only, which is markedly less accurate — an unconstrained
 * read has no way to reject a plausibly-shaped misread.
 *
 * `namesById` is optional but strongly recommended: collector numbers are
 * dense, so a single misread digit usually produces another valid id that no
 * amount of id checking can catch. Cross-checking the printed card name is
 * what rejects those.
 */
export function resolveScannedCardId(
  text: string,
  knownIds?: ReadonlySet<string>,
  namesById?: ReadonlyMap<string, string>,
): ScanMatch | null {
  const tokens = extractCardIdTokens(text);
  if (!tokens.length) return null;

  const repaired: ScanMatch[] = [];
  for (const token of tokens) {
    const cardId = repairCardId(token);
    if (!cardId) continue;
    // An untouched token that already reads as a valid id is the strongest signal.
    const confidence: ScanConfidence = token === cardId ? "exact" : "repaired";
    repaired.push({ card_id: cardId, confidence, source: token });
  }
  if (!repaired.length) return null;
  if (!knownIds || knownIds.size === 0) {
    return repaired.find((m) => m.confidence === "exact") ?? repaired[0];
  }

  const inCatalog = repaired.filter((m) => knownIds.has(m.card_id));
  if (inCatalog.length) {
    const best = inCatalog.find((m) => m.confidence === "exact") ?? inCatalog[0];
    if (!namesById) return best;
    // The id is real, but a misread digit lands on a real id too. If the
    // printed name disagrees, prefer a neighbour whose name actually matches.
    const bestName = namesById.get(best.card_id);
    if (bestName && nameOverlapScore(bestName, text) >= NAME_MATCH_MIN) return best;
    const rescued = fuzzyCandidates(best.card_id, knownIds)
      .map((id) => ({ id, score: nameOverlapScore(namesById.get(id) ?? "", text) }))
      .filter((c) => c.score >= NAME_MATCH_MIN)
      .sort((a, b) => b.score - a.score);
    if (rescued.length === 1 || (rescued.length > 1 && rescued[0].score > rescued[1].score)) {
      return { card_id: rescued[0].id, confidence: "fuzzy", source: best.source };
    }
    return best;
  }
  // Nothing matched outright — allow a single digit substitution, but only if
  // it resolves unambiguously to one real card.
  for (const match of repaired) {
    const near = fuzzyCandidates(match.card_id, knownIds);
    if (near.length === 1) {
      return { card_id: near[0], confidence: "fuzzy", source: match.source };
    }
  }
  return null;
}

export type ScanVote = {
  card_id: string;
  /** Frames that agreed on this id. */
  count: number;
  /** Best confidence seen across the agreeing frames. */
  confidence: ScanConfidence;
};

const CONFIDENCE_RANK: Record<ScanConfidence, number> = {
  exact: 0,
  repaired: 1,
  fuzzy: 2,
};

/**
 * Tally resolved ids across consecutive frames and return the leader.
 *
 * Live capture gets many reads of the same card under varying glare and angle;
 * agreement across frames rejects one-off misreads that shape repair alone
 * would happily accept.
 */
export function voteScannedCardId(matches: readonly (ScanMatch | null)[]): ScanVote | null {
  const tally = new Map<string, ScanVote>();
  for (const match of matches) {
    if (!match) continue;
    const prev = tally.get(match.card_id);
    if (!prev) {
      tally.set(match.card_id, {
        card_id: match.card_id,
        count: 1,
        confidence: match.confidence,
      });
      continue;
    }
    prev.count += 1;
    if (CONFIDENCE_RANK[match.confidence] < CONFIDENCE_RANK[prev.confidence]) {
      prev.confidence = match.confidence;
    }
  }
  let best: ScanVote | null = null;
  for (const vote of tally.values()) {
    if (
      !best ||
      vote.count > best.count ||
      (vote.count === best.count &&
        CONFIDENCE_RANK[vote.confidence] < CONFIDENCE_RANK[best.confidence])
    ) {
      best = vote;
    }
  }
  return best;
}
