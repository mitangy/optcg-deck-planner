import { issueKey, type AuditIssue } from "./audit";

/**
 * UI audit findings that are already known, so a run fails only on new ones.
 * Each pattern is matched against `kind where "text": detail`. Delete an
 * entry when its fix lands (the audit will then guard against a relapse).
 */
export const KNOWN_UI_ISSUES: Array<{ pattern: RegExp; note: string }> = [];

export function isKnown(issue: AuditIssue): boolean {
  const line = `${issueKey(issue)}: ${issue.detail}`;
  return KNOWN_UI_ISSUES.some((k) => k.pattern.test(line));
}
