/**
 * The eval's gold must be what the engine and the tools compute today: each B case's board is played out by the
 * rules engine, and each offline C case's expected answer is re-derived from the same tool the model calls.
 * Live cases (the FAQ, the ban list) are checked by `npm run eval:check-live` instead.
 */
import { runScenario } from "@optcg/rules/src/testing/scenario";
import { describe, expect, it } from "vitest";
import { loadCatalog } from "../src/catalog";
import { CASES } from "./cases";
import { goldFor } from "./gold";

const catalog = loadCatalog();

const B_TITLES: Record<string, string> = {
  B01: "Kaido adds one DON!! for two K.O.s",
  B02: "King does nothing to Karoo with 9 DON!!",
  B03: "Smiley is 5000 with 3 cards in hand and 1 DON!!",
  B04: "Usopp stops Sanji's block but not Chopper's",
  B05: "Franky with 1 DON!! attacks an active Character",
  B06: "Moria has Double Attack with 5 cards in hand",
  B07: "Burgess survives X.Drake's K.O.",
  B08: "Ivankov does not draw with a card in hand",
  B09: "Radical Beam makes the Leader 9000 at 2 Life",
  B10: "Rayleigh does nothing with a one-color Leader",
  B11: "Doc Q draws 1 and K.O.s two cost-1 Characters",
  B12: "Caribou K.O.s Karoo when K.O.'d",
};

const C_TITLES: Record<string, string> = {
  C01: "analyze_deck passes the Zoro list",
  C02: "analyze_deck flags 5 copies of OP01-004",
  C03: "analyze_deck flags a 49-card list",
  C04: "analyze_deck flags an off-color Kin'emon",
  C05: "analyze_deck flags a cost-5 card under Rayleigh",
  C06: "analyze_deck flags a cost-4 event under Imu",
  C07: "analyze_deck lets Pacifista run 10 copies",
  C10: "draw_odds gives 35.3% for a 4-of in the opening hand going first",
  C11: "draw_odds gives 78% by turn 3 going second",
  C12: "draw_odds gives 91.2% with a mulligan",
  C15: "draw_odds gives 80.6% for 2 of 16 counters by turn 3 going second",
};

describe("eval gold: engine scenarios", () => {
  for (const c of CASES) {
    if (c.group !== "B") continue;
    it(`eval gold ${c.id} ${B_TITLES[c.id]} (#403)`, () => runScenario(c.scenario));
  }
});

describe("eval gold: tool answers", () => {
  for (const c of CASES) {
    if (c.group !== "C" || c.live || c.tool === "card_rulings") continue;
    it(`eval gold ${c.id} ${C_TITLES[c.id]} (#403)`, async () => {
      const gold = await goldFor(c, { catalog });
      expect(gold.reason).toBeUndefined();
      expect(gold.status).toBe("ok");
    });
  }
});
