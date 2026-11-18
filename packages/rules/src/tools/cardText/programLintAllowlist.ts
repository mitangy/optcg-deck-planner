import type { FindingKind, LintFinding } from "./programLint.js";

export interface AllowEntry {
  kind: FindingKind;
  reason: string;
}

export const PROGRAM_LINT_ALLOWLIST: Readonly<Record<string, AllowEntry>> = {
  // Empty: every finding so far was a real bug and got fixed. Add `"<ability id>": { kind, reason }` only for a program that is correct as written.
};

export interface AllowlistResult {
  unexpected: LintFinding[];
  allowed: LintFinding[];
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
