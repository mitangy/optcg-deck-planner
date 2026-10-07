/**
 * Keeps Bandai's text out of git: an answer is stored in human-grades.jsonl only when it shares fewer than
 * OVERLAP_WORDS consecutive words with the official text the run read.
 */

export const OVERLAP_WORDS = 12;

const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);

/** The longest run of consecutive words the text shares with the corpus. */
export function officialOverlap(text: string, corpus: string): number {
  const a = words(text);
  const b = words(corpus);
  const at = new Map<string, number[]>();
  b.forEach((w, i) => at.set(w, [...(at.get(w) ?? []), i]));
  let best = 0;
  for (let i = 0; i < a.length; i++) {
    for (const j of at.get(a[i]!) ?? []) {
      let n = 0;
      while (i + n < a.length && j + n < b.length && a[i + n] === b[j + n]) n++;
      if (n > best) best = n;
    }
  }
  return best;
}

/** True when the answer is safe to commit: it repeats fewer than `n` consecutive words of the official text. */
export function shareable(text: string, corpus: string, n = OVERLAP_WORDS): boolean {
  return officialOverlap(text, corpus) < n;
}
