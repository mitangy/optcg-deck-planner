import { describe, expect, it } from "vitest";
import { loadCatalog } from "./catalog";
import { changeOver, priceHistory, weeklySample } from "./priceHistory";
import { buildTools } from "./server";
import { adaptToolResult, type SearchResultBlock } from "./sources";

const catalog = loadCatalog();
const TODAY = "2026-11-04";
const ago = (days: number, from = TODAY) => new Date(Date.parse(`${from}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

/** A 152-day history of an alternate art: 10 on day 0, a presale peak of 60 on day 3, then 40, 30, 25 and finally 20. */
const AGE = 151;
const RELEASED = ago(AGE);
const series: [string, number][] = Array.from({ length: AGE + 1 }, (_, i) => [ago(AGE - i), i === 0 ? 10 : i === 3 ? 60 : i < 60 ? 40 : i <= AGE - 90 ? 30 : i <= AGE - 30 ? 25 : 20]);

const ALT = { card_id: "OP05-119", product_id: 555, name: "Monkey.D.Luffy (Alternate Art)", group_name: "Awakening of the New Era", released: RELEASED, current: 20, points: series };

function planner(answer: unknown, status = 200) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string> });
    return new Response(JSON.stringify(answer), { status });
  }) as unknown as typeof fetch;
  return { calls, api: { baseUrl: "https://api.test", serviceSecret: "svc", fetchImpl } };
}

describe("price_history tool (#946)", () => {
  it("asks the public price-history endpoint for the art, without credentials", async () => {
    const { calls, api } = planner(ALT);
    await priceHistory(api, { card_id: " op05-119 ", product_id: 555 }, TODAY);
    await priceHistory(api, { card_id: "OP05-119" }, TODAY);
    await priceHistory(api, { card_id: "OP05-119", product_id: 0 }, TODAY);
    expect(calls.map((c) => c.url)).toEqual([
      "https://api.test/catalog/cards/OP05-119/price-history?product_id=555",
      "https://api.test/catalog/cards/OP05-119/price-history?product_id=0",
      "https://api.test/catalog/cards/OP05-119/price-history?product_id=0",
    ]);
    expect(calls[0]!.headers).toEqual({});
  });

  it("reports the peak, the low since it, the 30 and 90 day change and the age", async () => {
    const out = await priceHistory(planner(ALT).api, { card_id: "OP05-119", product_id: 555 }, TODAY);
    expect(out).toMatchObject({
      card_id: "OP05-119",
      product_id: 555,
      art_name: "Monkey.D.Luffy (Alternate Art)",
      set: "Awakening of the New Era",
      released: RELEASED,
      age_days: 151,
      now: 20,
      peak: { price: 60, date: ago(AGE - 3) },
      low_since_peak: { price: 20, date: ago(29) },
      change_30d_pct: -20,
      change_90d_pct: -33.3,
      history_days: 152,
    });
  });

  it("reads the art kind and what a typical card of that kind costs at this age and at 6 months", async () => {
    const out = await priceHistory(planner(ALT).api, { card_id: "OP05-119", product_id: 555 }, TODAY);
    expect(out.art_kind).toBe("alt");
    expect(out.typical_curve.percent_of_release_price_at_this_age).toBe(61.6);
    expect(out.typical_curve.percent_of_release_price_at_6_months).toBe(58.4);
    expect(out.typical_curve.basis).toMatch(/not a forecast/);
  });

  it("adds the buyTiming read from @optcg/price-timing", async () => {
    const out = await priceHistory(planner(ALT).api, { card_id: "OP05-119", product_id: 555 }, TODAY);
    expect(out.buy_timing.verdict).toBe("good");
    // The same card 30 days in is still well above where its kind settles.
    const early = await priceHistory(planner({ ...ALT, released: ago(30) }).api, { card_id: "OP05-119", product_id: 555 }, TODAY);
    expect(early.buy_timing.verdict).toBe("wait");
    expect(early.buy_timing.expectedFurtherDropPct).toBe(24);
  });

  it("adds a best time to buy: now for an older art, a dated window with an estimate for a fresh one (#952)", async () => {
    const old = await priceHistory(planner(ALT).api, { card_id: "OP05-119", product_id: 555 }, TODAY);
    expect(old.best_time_to_buy).toEqual({
      when: "now",
      from: TODAY,
      to: ago(-30),
      label: "Now",
      est_low: 20,
      est_high: 20,
      basis: "Most of the typical drop is done.",
    });
    const fresh = await priceHistory(planner({ ...ALT, released: ago(20) }).api, { card_id: "OP05-119", product_id: 555 }, TODAY);
    expect(fresh.best_time_to_buy).toMatchObject({ when: "window", from: ago(-21), to: ago(-81), label: "Nov 2026 – Jan 2027", est_low: 13.32, est_high: 16.28 });
    const none = await priceHistory(planner({ ...ALT, released: null, current: null, points: [] }).api, { card_id: "OP05-119", product_id: 555 }, TODAY);
    expect(none.best_time_to_buy).toBeNull();
  });

  it("calls a Manga art a chase art that holds, and a plain name unclassified", async () => {
    const manga = await priceHistory(planner({ ...ALT, name: "Monkey.D.Luffy (Manga)" }).api, { card_id: "OP05-119", product_id: 9 }, TODAY);
    expect(manga.art_kind).toBe("chase");
    expect(manga.buy_timing.verdict).toBe("holds");
    const base = await priceHistory(planner({ ...ALT, name: "Monkey.D.Luffy", product_id: 0 }).api, { card_id: "OP05-119" }, TODAY);
    expect(base.art_kind).toBe("other");
    expect(base.notes.join(" ")).toMatch(/base art/);
  });

  it("answers an art with no history or release date without inventing numbers", async () => {
    const out = await priceHistory(planner({ ...ALT, released: null, current: null, points: [] }).api, { card_id: "OP05-119", product_id: 555 }, TODAY);
    expect(out).toMatchObject({ now: null, peak: null, low_since_peak: null, change_30d_pct: null, age_days: null, weekly_points: [] });
    expect(out.typical_curve.percent_of_release_price_at_this_age).toBeNull();
    expect(out.buy_timing.verdict).toBe("unknown");
  });

  it("passes the planner's refusal on as the tool error", async () => {
    const tool = buildTools(catalog, undefined, undefined, { stats: planner({ detail: "Unknown card or art" }, 404).api }).find((t) => t.name === "price_history")!;
    const out = await tool.run({ card_id: "XX99-999" });
    expect(out.isError).toBe(true);
    expect(out.content[0]!.text).toMatch(/Unknown card or art/);
  });
});

describe("weekly sample (#946)", () => {
  it("keeps one point a week for 26 weeks ending on the newest day, not the whole series", () => {
    const long = Array.from({ length: 700 }, (_, i) => ({ date: ago(699 - i), price: i + 1 }));
    const w = weeklySample(long);
    expect(w).toHaveLength(26);
    expect(w[25]).toEqual([TODAY, 700]);
    expect(w[24]![0]).toBe(ago(7));
    expect(w[0]![0]).toBe(ago(175));
  });

  it("starts where the history starts, and falls back to the newest earlier day over a gap", () => {
    expect(weeklySample(series.map(([date, price]) => ({ date, price })))).toHaveLength(22);
    const gappy = [
      { date: ago(20), price: 5 },
      { date: ago(3), price: 8 },
      { date: TODAY, price: 9 },
    ];
    // 14 and 7 days back both fall in the gap and take the day-20 price, which is listed once; day 3 is not a weekly mark.
    expect(weeklySample(gappy)).toEqual([
      [ago(20), 5],
      [TODAY, 9],
    ]);
  });
});

describe("change over a period (#946)", () => {
  const pts = [
    { date: ago(100), price: 10 },
    { date: ago(30), price: 20 },
    { date: ago(29), price: 40 },
    { date: TODAY, price: 50 },
  ];
  it("compares with the newest price on or before the cut-off day", () => {
    expect(changeOver(pts, 50, 30)).toBe(150);
    expect(changeOver(pts, 50, 90)).toBe(400);
  });
  it("is null when the history does not reach back that far", () => {
    expect(changeOver(pts, 50, 200)).toBeNull();
    expect(changeOver([], 50, 30)).toBeNull();
  });
});

describe("price_history as a source and a tool (#946)", () => {
  it("is offered with the planner API, to MCP and chat alike, and not without it", () => {
    expect(buildTools(catalog).map((t) => t.name)).not.toContain("price_history");
    expect(buildTools(catalog, undefined, undefined, { stats: planner(ALT).api }).map((t) => t.name)).toContain("price_history");
  });

  it("turns an answer into one price: search result per art, with every fact citable on its own", async () => {
    const tool = buildTools(catalog, undefined, undefined, { stats: planner(ALT).api }).find((t) => t.name === "price_history")!;
    const out = await tool.run({ card_id: "OP05-119", product_id: 555 });
    const blocks = adaptToolResult("price_history", out.content[0]!.text)!;
    expect(blocks.every((b) => b.type === "search_result")).toBe(true);
    const r = blocks[0] as SearchResultBlock;
    expect(r.source).toBe("price:OP05-119#555");
    expect(r.title).toBe("Price history: Monkey.D.Luffy (Alternate Art) (OP05-119)");
    const text = r.content.map((c) => c.text);
    expect(text[0]).toMatch(/TCGPlayer market price \$20\.00 now/);
    expect(text.join("\n")).toMatch(/Peak \$60\.00 on /);
    expect(text.join("\n")).toMatch(/not a forecast/);
    expect(text.join("\n")).toContain("Most of the typical drop is done at this age.");
  });

  it("names the base art without a product part", async () => {
    const tool = buildTools(catalog, undefined, undefined, { stats: planner({ ...ALT, product_id: 0 }).api }).find((t) => t.name === "price_history")!;
    const out = await tool.run({ card_id: "OP05-119" });
    expect(adaptToolResult("price_history", out.content[0]!.text)!.map((b) => (b as SearchResultBlock).source)).toEqual(["price:OP05-119"]);
  });
});
