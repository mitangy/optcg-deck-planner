import { describe, expect, it } from "vitest";
import type { PriceAlert } from "../api";
import { parseTarget } from "./PriceAlerts";
import {
  alertDistance,
  chipTarget,
  cleanCardName,
  formatTarget,
  groupAlerts,
  lastHitLine,
  recentHitCount,
  recentHitLine,
  shortArtName,
} from "./alertList";

const alert = (over: Partial<PriceAlert> = {}): PriceAlert => ({
  id: 1,
  card_id: "OP01-001",
  product_id: 0,
  card_name: "Luffy",
  art_name: "Base",
  image_url: "",
  tcgplayer_url: "",
  is_alt: false,
  current_price: 100,
  target_price: 80,
  direction: "below",
  notify_email: true,
  notify_app: true,
  paused: false,
  armed: true,
  met_now: false,
  triggered_at: null,
  created_at: "2026-11-01T00:00:00Z",
  ...over,
});

describe("alert list order (#1360)", () => {
  it("groups Hit, then Watching, then Paused, and leaves empty groups out (#1360)", () => {
    const groups = groupAlerts([
      alert({ id: 1, paused: true }),
      alert({ id: 2 }),
      alert({ id: 3, armed: false, triggered_at: "2026-11-16T10:00:00Z", triggered_price: 98.5 }),
      alert({ id: 4, armed: false, met_now: true }),
    ]);
    expect(groups.map((g) => [g.key, g.alerts.map((a) => a.id)])).toEqual([
      ["hit", [3, 4]],
      ["watching", [2]],
      ["paused", [1]],
    ]);
    expect(groupAlerts([alert({ id: 9 })]).map((g) => g.key)).toEqual(["watching"]);
  });

  it("Watching lists the alert closest to its target first, in either direction (#1360)", () => {
    const [watching] = groupAlerts([
      alert({ id: 1, current_price: 200, target_price: 100 }), // 50% to go
      alert({ id: 2, current_price: 100, target_price: 95 }), // 5% to go
      alert({ id: 3, current_price: 100, target_price: 120, direction: "above" }), // 17% to go
      alert({ id: 4, current_price: null }), // no price sorts last
    ]);
    expect(watching.alerts.map((a) => a.id)).toEqual([2, 3, 1, 4]);
  });

  it("Hit lists the newest hit first (#1360)", () => {
    const [hit] = groupAlerts([
      alert({ id: 1, armed: false, triggered_at: "2026-11-10T10:00:00Z" }),
      alert({ id: 2, armed: false, triggered_at: "2026-11-16T10:00:00Z" }),
    ]);
    expect(hit.alerts.map((a) => a.id)).toEqual([2, 1]);
  });

  it("counts hits from the last 7 days, including alerts that re-armed since (#1360)", () => {
    const now = Date.parse("2026-11-18T12:00:00Z");
    const list = [
      alert({ id: 1, armed: false, triggered_at: "2026-11-16T10:00:00Z" }),
      alert({ id: 2, armed: true, triggered_at: "2026-11-12T10:00:00Z" }),
      alert({ id: 3, armed: false, triggered_at: "2026-11-01T10:00:00Z" }),
      alert({ id: 4 }),
    ];
    expect(recentHitCount(list, now)).toBe(2);
    expect(recentHitLine(2)).toBe("2 hit in the last 7 days");
    expect(recentHitLine(0)).toBeNull();
  });

  it("a re-armed alert keeps a Last hit line, a never-fired one has none (#1360)", () => {
    expect(lastHitLine(alert({ armed: true, triggered_at: "2026-11-16T10:00:00Z", triggered_price: 98.5, paused: false }))).toBe(
      "Last hit Nov 16 at $98.50",
    );
    expect(lastHitLine(alert())).toBeNull();
    expect(lastHitLine(alert({ armed: false, triggered_at: "2026-11-16T10:00:00Z" }))).toBeNull();
  });
});

describe("distance to target (#1360)", () => {
  it("below alert still above target: dollars above and percent of the market price to go (#1360)", () => {
    expect(alertDistance({ current_price: 191.67, target_price: 149.5, direction: "below" })?.text).toBe(
      "$42.17 above target · 22% to go",
    );
  });

  it("above alert still below target says below (#1360)", () => {
    expect(alertDistance({ current_price: 150, target_price: 200, direction: "above" })?.text).toBe(
      "$50.00 below target · 33% to go",
    );
  });

  it("says At target once met and nothing without a price (#1360)", () => {
    expect(alertDistance({ current_price: 98.5, target_price: 100, direction: "below" })?.text).toBe("At target");
    expect(alertDistance({ current_price: 210, target_price: 200, direction: "above" })?.text).toBe("At target");
    expect(alertDistance({ current_price: null, target_price: 100, direction: "below" })).toBeNull();
  });
});

describe("short art and card names (#1360)", () => {
  it("strips the card name, id, joins and parentheses from the real art names (#1360)", () => {
    expect(shortArtName("Monkey.D.Luffy (118) (Super Alternate Art)", "Monkey.D.Luffy", "OP05-119")).toBe("Super Alternate Art");
    expect(shortArtName("Gol.D.Roger - OP09-118 (SP) (Wanted Poster)", "Gol.D.Roger", "OP09-118")).toBe("SP · Wanted Poster");
    expect(shortArtName("Boa Hancock (OP14-041) (Heroine Leader)", "Boa Hancock", "OP14-041")).toBe("Heroine Leader");
    expect(shortArtName("Dracule Mihawk - OP12-030 (SP)", "Dracule Mihawk", "OP12-030")).toBe("SP");
    expect(shortArtName("Base", "Luffy", "OP01-001")).toBe("Base art");
  });

  it("shortArtName drops the card name when the card name carries a number like (041) (#1416)", () => {
    expect(shortArtName("Nami (OP11-041) (Heroine Leader)", "Nami (041)", "OP11-041")).toBe("Heroine Leader");
  });

  it("falls back to the raw name when stripping leaves nothing (#1360)", () => {
    expect(shortArtName("Luffy - OP01-001", "Luffy", "OP01-001")).toBe("Luffy - OP01-001");
  });

  it("cleanCardName drops the id and a trailing Reprint but keeps numbers like (118) (#1360)", () => {
    expect(cleanCardName("Boa Hancock - OP14-041", "OP14-041")).toBe("Boa Hancock");
    expect(cleanCardName("Monkey.D.Luffy - EB02-061 (Reprint)", "EB02-061")).toBe("Monkey.D.Luffy");
    expect(cleanCardName("Monkey.D.Luffy (118)", "OP05-119")).toBe("Monkey.D.Luffy (118)");
  });
});

describe("target money helpers (#1360)", () => {
  it("parseTarget accepts thousands commas (#1360)", () => {
    expect(parseTarget("1,900.00")).toBe(1900);
    expect(parseTarget("$2,450.5")).toBe(2450.5);
  });

  it("targets show commas at rest and quick chips move the current price by the percent (#1360)", () => {
    expect(formatTarget(1900)).toBe("1,900.00");
    expect(chipTarget(200, "below", 20)).toBe("160.00");
    expect(chipTarget(200, "above", 10)).toBe("220.00");
    expect(chipTarget(null, "below", 10)).toBe("");
  });
});
