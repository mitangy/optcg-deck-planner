/** Did the answer cite the right sources? A tool-free answer from memory cites nothing, so this is the check that catches it. */
import type { Cites, SourceRule } from "../types";

/** A source id matches a rule exactly, by a `*` suffix wildcard, or with `<n>` standing for digits. */
export function sourceMatches(rule: SourceRule, source: string): boolean {
  if (rule.endsWith("*")) return source.startsWith(rule.slice(0, -1));
  if (rule.includes("<n>")) return new RegExp(`^${rule.split("<n>").map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\d+")}$`).test(source);
  return source === rule;
}

export type CitationCheck = { ok: boolean; missing: SourceRule[][]; forbidden: string[] };

export function citationCheck(citations: readonly { source: string }[], cites: Cites): CitationCheck {
  const sources = [...new Set(citations.map((c) => c.source))];
  const hit = (group: SourceRule[]) => sources.some((s) => group.some((rule) => sourceMatches(rule, s)));
  const missing = cites.all.filter((group) => !hit(group));
  const forbidden = sources.filter((s) => (cites.none ?? []).some((rule) => sourceMatches(rule, s)));
  return { ok: missing.length === 0 && forbidden.length === 0, missing, forbidden };
}
