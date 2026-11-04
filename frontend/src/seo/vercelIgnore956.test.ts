import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const config = (rel: string) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8")) as { ignoreCommand: string };

// Vercel rejects a vercel.json whose ignoreCommand is over 256 characters, and then nothing deploys (#956).
describe("vercel ignoreCommand (#956)", () => {
  it.each([
    ["planner", "../../../vercel.json"],
    ["duel-web", "../../../duel-web/vercel.json"],
  ])("the %s ignoreCommand fits Vercel's 256-character limit (#956)", (_app, rel) => {
    expect(config(rel).ignoreCommand.length).toBeLessThanOrEqual(256);
  });

  it("a planner build still runs when the card text the card page shows changes (#956)", () => {
    const paths = config("../../../vercel.json").ignoreCommand.split(/\s+/).slice(2);
    expect(paths.some((p) => "packages/rules/src/cards/cardData.json".startsWith(p))).toBe(true);
  });
});
