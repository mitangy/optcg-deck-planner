import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = dirname(fileURLToPath(import.meta.url));

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return cssFiles(path);
    return entry.name.endsWith(".css") ? [path] : [];
  });
}

describe("stylesheets", () => {
  it("no stylesheet keeps git conflict markers, which make the build drop half the CSS (#826)", () => {
    const files = cssFiles(SRC);
    expect(files.length).toBeGreaterThan(0);
    const found: string[] = [];
    for (const file of files) {
      readFileSync(file, "utf8")
        .split(/\r?\n/)
        .forEach((line, i) => {
          if (/^(<{7}|={7}|>{7})/.test(line)) found.push(`${file.slice(SRC.length + 1)}:${i + 1}`);
        });
    }
    expect(found).toEqual([]);
  });
});
