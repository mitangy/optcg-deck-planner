/**
 * Findings of `programLint.ts` that are accepted, keyed by ability id. Every entry needs a one-line reason why the
 * program is correct as written, or says "known bug, see report" for a real bug that is tracked elsewhere. An entry
 * only covers its own kind of finding, and the test fails when an entry stops matching anything.
 */
import type { FindingKind, LintFinding } from "./programLint.js";

export interface AllowEntry {
  kind: FindingKind;
  reason: string;
}

export const PROGRAM_LINT_ALLOWLIST: Readonly<Record<string, AllowEntry>> = {
  // Empty: every finding so far was a real bug and got fixed. Add `"<ability id>": { kind, reason }` only for a program that is correct as written.
};

export interface AllowlistResult {
  /** Findings with no allowlist entry. */
  unexpected: LintFinding[];
  allowed: LintFinding[];
  /** Allowlist keys that matched no finding: the program was fixed or changed, so the entry should go. */
  stale: string[];
}

export function applyAllowlist(findings: readonly LintFinding[], allowlist: Readonly<Record<string, AllowEntry>> = PROGRAM_LINT_ALLOWLIST): AllowlistResult {
  const unexpected: LintFinding[] = [];
  const allowed: LintFinding[] = [];
  const used = new Set<string>();
  for (const f of findings) {
    if (allowlist[f.abilityId]?.kind === f.kind) { allowed.push(f); used.add(f.abilityId); } else unexpected.push(f);
  }
  return { unexpected, allowed, stale: Object.keys(allowlist).filter((id) => !used.has(id)) };
}
