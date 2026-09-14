import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { lifePileFaceCount, zonePileCountLabel } from "./ZonePile";

describe("zonePileCountLabel", () => {
  it("shows actual life count instead of question marks", () => {
    expect(zonePileCountLabel(4, 5)).toBe("4");
  });

  it("shows expected leader life before life cards are dealt", () => {
    expect(zonePileCountLabel(0, 5)).toBe("0 / 5");
  });

  it("shows zero when no expected count", () => {
    expect(zonePileCountLabel(0)).toBe("0");
  });
});

describe("lifePileFaceCount", () => {
  it("renders one face per life card", () => {
    expect(lifePileFaceCount(1)).toBe(1);
    expect(lifePileFaceCount(4)).toBe(4);
    expect(lifePileFaceCount(5)).toBe(5);
  });

  it("caps the vertical fan at 5 faces", () => {
    expect(lifePileFaceCount(6)).toBe(5);
    expect(lifePileFaceCount(99)).toBe(5);
  });

  it("shows no faces when life is empty", () => {
    expect(lifePileFaceCount(0)).toBe(0);
    expect(lifePileFaceCount(-1)).toBe(0);
  });
});

describe("side-grid life / stage / deck layout", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(join(here, "..", "styles.css"), "utf8");

  it("places stage above deck on the right rail with characters spanning two rows", () => {
    const match = css.match(/\.side-grid\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/);
    expect(match).not.toBeNull();
    const body = match![1];
    expect(body.replace(/\s+/g, " ")).toMatch(
      /grid-template-areas:\s*"life characters stage"\s*"leader characters deck"\s*"dondeck cost trash"/,
    );
  });

  it("styles life as a vertical flex column fan", () => {
    expect(css).toMatch(/\.zone-pile-life \.zone-pile-stack\s*\{[^}]*flex-direction:\s*column/);
  });
});
