import { issueKey, type AuditIssue } from "./audit";

/**
 * UI audit findings that are already known, so a run fails only on new ones.
 * Each pattern is matched against `kind where "text": detail`. Delete an
 * entry when its fix lands (the audit will then guard against a relapse).
 */
export const KNOWN_UI_ISSUES: Array<{ pattern: RegExp; note: string }> = [
  {
    pattern: /^covered .* under (div\.hand-fan|.*counter-badge|.*\(in the hand fan\)$)/,
    note: "Fanned hand covers the bottom of your mat on desktop: DON!! row, deck and trash counts, Leader caption, Trash button",
  },
  {
    pattern: /^covered .*(don-strip|zone-pile|zone-trash).* under div\.rotate-hint/,
    note: "Phone portrait: the 'Rotate for bigger cards' toast sits on the DON!! row and Trash",
  },
  {
    pattern: /^((spill|offscreen) .*intent-btn-keep "Keep opening hand"|hscroll div\.intent-bar\.intent-bar-mulligan )/,
    note: "Phone mulligan: the two buttons don't fit; 'Keep opening hand' runs ~25px off the right edge and the row scrolls sideways",
  },
  {
    pattern: /^spill .*card-tile\.compact > div\.card-caption > div\.meta "Cost \d+": text cut/,
    note: "Compact cards in prompts: the cost line is clipped by ~3px",
  },
  {
    pattern: /^spill .*span\.zone-pile-label "DON!! Deck": text cut \d+px by .*section\.side-field\.side-you/,
    note: "Phone: the 'DON!! Deck' label is cut off at the left edge of your mat",
  },
  {
    pattern: /span\.power-mod-up "\+\d+": (text cut|.* under div\.side-grid > div\.zone-stage)/,
    note: "Full board with many statuses: the cost modifier is cut off at the card edge and runs under the Stage card",
  },
  {
    pattern: /^covered .*span\.power-base "\d+": .* under .*span\.mat-order/,
    note: "Full board: the 'Going 1st' mat label sits on a Character's power badge",
  },
];

export function isKnown(issue: AuditIssue): boolean {
  const line = `${issueKey(issue)}: ${issue.detail}`;
  return KNOWN_UI_ISSUES.some((k) => k.pattern.test(line));
}
