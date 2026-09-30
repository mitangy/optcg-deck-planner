import { issueKey, type AuditIssue } from "./audit";

/**
 * UI audit findings that are already known, so a run fails only on new ones.
 * Each pattern is matched against `kind where "text": detail`. Delete an
 * entry when its fix lands (the audit will then guard against a relapse).
 */
export const KNOWN_UI_ISSUES: Array<{ pattern: RegExp; note: string }> = [
  {
    pattern: /^covered .* under (div\.hand-fan|.*counter-badge)/,
    note: "Fanned hand covers the bottom of your mat on desktop: DON!! row, deck and trash counts, Leader caption, Trash button",
  },
  {
    pattern: /^((spill|offscreen) .*intent-btn-keep "Keep opening hand"|hscroll div\.intent-bar\.intent-bar-mulligan )/,
    note: "Phone mulligan: the two buttons don't fit; 'Keep opening hand' runs ~25px off the right edge and the row scrolls sideways",
  },
  {
    pattern: /"Summoning sick": text runs/,
    note: "Choice prompt: the 'Summoning sick' readiness chip spills out of its box",
  },
  {
    pattern: /^spill .*card-tile\.compact > div\.card-caption > div\.meta "Cost \d+": text cut/,
    note: "Compact cards in prompts: the cost line is clipped by ~3px",
  },
  {
    pattern: /^covered .*card-tile\.(compact|full) > div\.card-caption > div\.(name|meta) .* under (div\.(card-stat-stack|card-overlays)|button\.card-tile\.(compact|full) > div\.card-caption > div\.meta)/,
    note: "Small cards: power badge / status chips sit on the name and cost, and a two-line name runs under the cost line",
  },
  {
    pattern: /^spill .*span\.zone-pile-label "DON!! Deck": text cut \d+px by .*section\.side-field\.side-you/,
    note: "Phone: the 'DON!! Deck' label is cut off at the left edge of your mat",
  },
  {
    pattern: /^covered .*zone-pile-don > div\.zone-pile-meta > span\.zone-pile-count "\d+": .* under div\.don-strip-rail/,
    note: "Phone mulligan: the 'DON!! Deck' caption is wider than its pile, so its count runs under the DON!! row (was hidden under the Rotate toast)",
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
