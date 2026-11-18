import { issueKey, type AuditIssue } from "./audit";

export const KNOWN_UI_ISSUES: Array<{ pattern: RegExp; note: string }> = [];

export function isKnown(issue: AuditIssue): boolean {
  const line = `${issueKey(issue)}: ${issue.detail}`;
  return KNOWN_UI_ISSUES.some((k) => k.pattern.test(line));
}
