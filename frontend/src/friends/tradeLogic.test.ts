import { describe, expect, it } from "vitest";
import type { Trade, TradeLine } from "./friendsApi";
import { badgeLabel, counterPrefill, lineCap, lineQty, MAX_LINES, navBadgeCount, setLineQty, tradeSides, trayTotals, type CardCap, type TrayCard, type TrayLine } from "./tradeLogic";
import { usernameFormatError } from "./username";

const card = (over: Partial<TrayCard> = {}): TrayCard => ({
  side: "get",
  cardId: "OP09-001",
  productId: null,
  name: "Shanks",
  imageUrl: "",
  marketPrice: 2,
  printingLabel: null,
  ...over,
});
const cap = (spare: number, printings: Record<number, number> = {}, base: number = spare): CardCap => ({ spare, base, printings });

describe("trade tray caps (#703)", () => {
  it("never holds more copies of a card than the other side has spare (#703)", () => {
    let lines: TrayLine[] = [];
    for (let i = 0; i < 5; i++) lines = setLineQty(lines, card(), lineQty(lines, card()) + 1, cap(3));
    expect(lineQty(lines, card())).toBe(3);
  });

  it("shares one spare count between the standard printing and an alt printing of the same card (#703)", () => {
    const alt = card({ productId: 201, printingLabel: "Alt art" });
    let lines = setLineQty([], card(), 2, cap(3, { 201: 3 }));
    lines = setLineQty(lines, alt, 5, cap(3, { 201: 3 }));
    expect(lineQty(lines, alt)).toBe(1);
    expect(lineCap(lines, card(), cap(3, { 201: 3 }))).toBe(2);
  });

  it("limits an alt printing to the copies owned of that printing (#703)", () => {
    const alt = card({ productId: 201 });
    const lines = setLineQty([], alt, 4, cap(5, { 201: 2 }));
    expect(lineQty(lines, alt)).toBe(2);
  });

  it("limits the standard printing to base copies owned, even when alt copies make the spare bigger (#705)", () => {
    const c = cap(4, { 201: 3 }, 1);
    expect(lineCap([], card(), c)).toBe(1);
    expect(lineQty(setLineQty([], card(), 4, c), card())).toBe(1);
    expect(lineCap([], card({ productId: 201 }), c)).toBe(3);
    expect(lineCap([], card(), cap(2, { 201: 2 }, 0))).toBe(0);
  });

  it("does not let the give side use the get side's spare (#703)", () => {
    let lines = setLineQty([], card({ side: "get" }), 3, cap(3));
    lines = setLineQty(lines, card({ side: "give" }), 2, cap(2));
    expect(lines.map((l) => [l.side, l.qty])).toEqual([
      ["get", 3],
      ["give", 2],
    ]);
  });

  it("caps one line at 20 copies even when more are spare (#703)", () => {
    expect(lineQty(setLineQty([], card(), 30, cap(40)), card())).toBe(20);
  });

  it("adding the same card and printing again merges into one line, and 0 removes it (#703)", () => {
    let lines = setLineQty([], card(), 1, cap(3));
    lines = setLineQty(lines, card(), 2, cap(3));
    expect(lines).toHaveLength(1);
    expect(lines[0]!.qty).toBe(2);
    expect(setLineQty(lines, card(), 0, cap(3))).toEqual([]);
  });

  it("stops adding new cards at 40 lines (#703)", () => {
    let lines: TrayLine[] = [];
    for (let i = 0; i < MAX_LINES + 3; i++) lines = setLineQty(lines, card({ cardId: `OP01-${String(i).padStart(3, "0")}` }), 1, cap(1));
    expect(lines).toHaveLength(MAX_LINES);
  });
});

describe("trade tray totals (#703)", () => {
  it("adds copies and market value per side (#703)", () => {
    let lines = setLineQty([], card({ side: "get", marketPrice: 2.5 }), 2, cap(5));
    lines = setLineQty(lines, card({ side: "give", cardId: "OP01-001", marketPrice: 1.25 }), 3, cap(5));
    expect(trayTotals(lines)).toEqual({ giveCopies: 3, getCopies: 2, giveValue: 3.75, getValue: 5 });
  });

  it("has no value for a side that holds an unpriced card (#703)", () => {
    const lines = setLineQty([], card({ marketPrice: null }), 2, cap(5));
    expect(trayTotals(lines).getValue).toBeNull();
  });
});

const line = (side: "give" | "get", card_id: string, over: Partial<TradeLine> = {}): TradeLine => ({
  side,
  card_id,
  product_id: null,
  qty: 1,
  name: card_id,
  image_url: "",
  market_price: 1,
  printing_label: null,
  ...over,
});
const trade = (over: Partial<Trade> = {}): Trade => ({
  id: 7,
  from_user_id: 2,
  from_username: "kai",
  to_user_id: 1,
  to_username: "nami",
  status: "pending",
  message: "",
  parent_offer_id: null,
  created_at: 0,
  responded_at: null,
  completed_at: null,
  expires_at: 0,
  lines: [line("give", "A"), line("get", "B")],
  give_value: 10,
  get_value: 4,
  i_am_sender: false,
  my_applied: false,
  other_applied: false,
  ...over,
});

describe("which side of a trade is mine (#703)", () => {
  it("as the sender, give lines are what I hand over (#703)", () => {
    const s = tradeSides(trade({ i_am_sender: true }));
    expect(s.iGive.map((l) => l.card_id)).toEqual(["A"]);
    expect(s.iGet.map((l) => l.card_id)).toEqual(["B"]);
    expect([s.iGiveValue, s.iGetValue]).toEqual([10, 4]);
  });

  it("as the recipient, the sender's give lines are what I receive (#703)", () => {
    const s = tradeSides(trade({ i_am_sender: false }));
    expect(s.iGive.map((l) => l.card_id)).toEqual(["B"]);
    expect(s.iGet.map((l) => l.card_id)).toEqual(["A"]);
    expect([s.iGiveValue, s.iGetValue]).toEqual([4, 10]);
  });

  it("a counter starts from the offer turned around, keeping printings and quantities (#703)", () => {
    const t = trade({ lines: [line("give", "A", { qty: 2, product_id: 201, printing_label: "Alt art" }), line("get", "B", { qty: 3 })] });
    const lines = counterPrefill(t);
    expect(lines.map((l) => [l.side, l.cardId, l.qty, l.productId])).toEqual([
      ["get", "A", 2, 201],
      ["give", "B", 3, null],
    ]);
  });
});

describe("Friends nav badge (#703)", () => {
  it("counts offers waiting plus trades in progress (#703)", () => {
    expect(navBadgeCount({ incoming_pending: 2, active: 3 })).toBe(5);
    expect(navBadgeCount(undefined)).toBe(0);
  });

  it("shows 9+ for ten or more (#703)", () => {
    expect(badgeLabel(9)).toBe("9");
    expect(badgeLabel(10)).toBe("9+");
  });
});

describe("username format (#703)", () => {
  it("accepts 3 to 20 letters, digits, underscores and hyphens (#703)", () => {
    expect(usernameFormatError("Nami_01")).toBeNull();
    expect(usernameFormatError("abc")).toBeNull();
    expect(usernameFormatError("a".repeat(20))).toBeNull();
  });

  it("rejects names that are too short, too long or have other characters (#703)", () => {
    expect(usernameFormatError("ab")).toMatch(/3–20/);
    expect(usernameFormatError("a".repeat(21))).toMatch(/3–20/);
    expect(usernameFormatError("na mi")).toMatch(/letters/);
  });
});
