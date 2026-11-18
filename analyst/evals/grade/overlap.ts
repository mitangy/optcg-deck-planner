export const OVERLAP_WORDS = 12;

const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);

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

export function shareable(text: string, corpus: string, n = OVERLAP_WORDS): boolean {
  return officialOverlap(text, corpus) < n;
}
