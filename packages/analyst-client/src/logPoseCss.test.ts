import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Where braces go unbalanced in `css`: a `}` with nothing open, or a `{` left open at the end. Comments and quoted strings are ignored. */
function unbalancedBrace(css: string): string | null {
  const open: number[] = [];
  let line = 1;
  for (let i = 0; i < css.length; i++) {
    const c = css[i]!;
    if (c === "\n") line++;
    else if (c === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      const stop = end === -1 ? css.length : end + 2;
      for (const ch of css.slice(i, stop)) if (ch === "\n") line++;
      i = stop - 1;
    } else if (c === '"' || c === "'") {
      i++;
      while (i < css.length && css[i] !== c && css[i] !== "\n") i++;
    } else if (c === "{") open.push(line);
    else if (c === "}") {
      if (open.length === 0) return `a "}" on line ${line} closes nothing`;
      open.pop();
    }
  }
  return open.length ? `the block opened on line ${open[open.length - 1]} is never closed` : null;
}

/** The stylesheets the index pulls in with `@import "./x.css";`, in order (logPose.css is only that list). */
function importedParts(index: string): string[] {
  return [...index.matchAll(/^@import "(\.\/[^"]+)";$/gm)].map((m) => m[1]!);
}

describe("logPose.css", () => {
  it("logPose.css closes every block, so the host app's theme rules bundled after it stay top level (#417)", () => {
    const indexUrl = new URL("./logPose.css", import.meta.url);
    const parts = importedParts(readFileSync(indexUrl, "utf8"));
    expect(parts.length).toBeGreaterThan(0);
    for (const part of parts) {
      expect(unbalancedBrace(readFileSync(new URL(part, indexUrl), "utf8")), part).toBeNull();
    }
  });
});
