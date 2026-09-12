import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "..", "styles.css"), "utf8");

/**
 * The mobile character row must resolve to exactly one grid row of 5 equal
 * cells so the 5 character slots never spill/wrap onto extra lines
 * (regression: https://github.com/mitangy/optcg-deck-planner — "5 character
 * card slots spill into two rows" on mobile).
 */
function extractMobileBlock(source: string): string {
  // The trash-viewer mobile tweaks share the same "@media (max-width: 720px)"
  // query earlier in the file; find the block that actually mentions the
  // characters row.
  let searchFrom = 0;
  let start = -1;
  for (;;) {
    const candidate = source.indexOf("@media (max-width: 720px)", searchFrom);
    if (candidate === -1) break;
    const blockEnd = findBlockEnd(source, candidate);
    if (source.slice(candidate, blockEnd).includes(".characters-row")) {
      start = candidate;
      break;
    }
    searchFrom = blockEnd;
  }
  expect(start).toBeGreaterThanOrEqual(0);
  const blockStart = source.indexOf("{", start);
  const blockEnd = findBlockEnd(source, start);
  return source.slice(blockStart, blockEnd);
}

function findBlockEnd(source: string, atOrBeforeOpenBrace: number): number {
  let depth = 0;
  let i = source.indexOf("{", atOrBeforeOpenBrace);
  for (; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return source.length;
}

describe("mobile characters-row layout", () => {
  const mobileBlock = extractMobileBlock(css);

  it("uses an explicit 5-column grid for the characters row on mobile", () => {
    const gridRuleMatch = mobileBlock.match(/\.characters-row\s*\{([^}]*)\}/);
    expect(gridRuleMatch).not.toBeNull();
    const body = gridRuleMatch![1];
    expect(body).toMatch(/display:\s*grid/);
    expect(body).toMatch(/grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
  });

  it("sizes every card tile and empty slot in the row uniformly so they never wrap", () => {
    const cellRuleMatch = mobileBlock.match(
      /\.characters-row \.card-tile,\s*\n?\s*\.characters-row \.zone-slot\s*\{([^}]*)\}/,
    );
    expect(cellRuleMatch).not.toBeNull();
    const body = cellRuleMatch![1];
    expect(body).toMatch(/width:\s*100%/);
    expect(body).toMatch(/min-width:\s*0/);
    expect(body).toMatch(/aspect-ratio:/);
    // Capped so tiles don't balloon past their intended full size just below
    // the breakpoint and then visibly shrink again once desktop rules apply.
    expect(body).toMatch(/max-width:\s*70px/);
  });

  it("does not rely on flex-wrap for the characters row on mobile (root cause of the spill)", () => {
    const gridRuleMatch = mobileBlock.match(/\.characters-row\s*\{([^}]*)\}/);
    const body = gridRuleMatch![1];
    expect(body).not.toMatch(/flex-wrap/);
  });
});
