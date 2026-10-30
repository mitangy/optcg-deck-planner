import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Vite bundles every stylesheet into one file, so one broken rule can swallow the
// styles after it (the live match board lost its layout this way, #827).
const SRC = fileURLToPath(new URL(".", import.meta.url));

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return cssFiles(p);
    return e.name.endsWith(".css") ? [p] : [];
  });
}

/** Brace depth after the file, ignoring comments and strings; -1 if it ever closes more than it opened. */
function braceDepth(css: string): number {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""');
  let depth = 0;
  for (const c of text) {
    if (c === "{") depth++;
    else if (c === "}" && --depth < 0) return -1;
  }
  return depth;
}

const files = cssFiles(SRC).map((p) => [relative(SRC, p), readFileSync(p, "utf8")] as const);

describe("duel-web stylesheets (#827)", () => {
  it.each(files)("%s has no git conflict markers (#827)", (_name, css) => {
    expect(css.split("\n").filter((l) => /^(<{7}|={7}|>{7})(\s|$)/.test(l))).toEqual([]);
  });

  it.each(files)("%s closes every brace it opens (#827)", (_name, css) => {
    expect(braceDepth(css)).toBe(0);
  });
});
