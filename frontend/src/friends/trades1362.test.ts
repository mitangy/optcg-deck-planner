import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SpareItem, Trade, TradesOut } from "./friendsApi";
import {
  askableFromDeck,
  askToLines,
  buildAskParam,
  createDelayedCall,
  parseAskParam,
  tradeSections,
  tradeStatusLabel,
  tradeStatusTone,
  youNeedCopies,
} from "./tradeLogic";

const trade = (over: Partial<Trade> = {}): Trade =>
  ({
    id: 1,
    from_user_id: 2,
    from_username: "kai",
    to_user_id: 1,
    to_username: "nami",
    status: "pending",
    i_am_sender: false,
    my_applied: false,
    lines: [],
    ...over,
  }) as Trade;

const spare = (card_id: string, over: Partial<SpareItem> = {}): SpareItem =>
  ({
    card_id,
    name: card_id,
    image_url: "",
    market_price: 1,
    spare: 2,
    base_owned: 2,
    want: 1,
    printings: [],
    ...over,
  }) as SpareItem;

describe("trade status says whose move it is (#1362)", () => {
  it("an offer I must answer reads 'Your answer' and my own waiting offer names the friend (#1362)", () => {
    expect(tradeStatusLabel(trade({ status: "pending", i_am_sender: false }))).toBe("Your answer");
    expect(tradeStatusLabel(trade({ status: "pending", i_am_sender: true }))).toBe("Waiting on nami");
  });

  it("a completed trade asks me to update my collection until I have, then reads Traded (#1362)", () => {
    expect(tradeStatusLabel(trade({ status: "completed", my_applied: false }))).toBe("Update collection");
    expect(tradeStatusLabel(trade({ status: "completed", my_applied: true }))).toBe("Traded");
    expect(tradeStatusLabel(trade({ status: "accepted" }))).toBe("Swap the cards");
  });

  it("states that need me use the attention tone and waiting states stay neutral (#1362)", () => {
    expect(tradeStatusTone(trade({ status: "pending", i_am_sender: false }))).toBe("attention");
    expect(tradeStatusTone(trade({ status: "pending", i_am_sender: true }))).toBe("neutral");
    expect(tradeStatusTone(trade({ status: "completed", my_applied: false }))).toBe("attention");
  });
});

describe("trade sections put what needs me first (#1362)", () => {
  it("orders Needs you, In progress, Waiting on them, History and files a not-yet-applied completed trade under Needs you (#1362)", () => {
    const out: TradesOut = {
      incoming: [trade({ id: 1, status: "pending", i_am_sender: false })],
      outgoing: [trade({ id: 2, status: "pending", i_am_sender: true })],
      active: [trade({ id: 3, status: "accepted" }), trade({ id: 4, status: "completed", my_applied: false })],
      history: [trade({ id: 5, status: "completed", my_applied: true }), trade({ id: 6, status: "declined" })],
    };
    const sections = tradeSections(out);
    expect(sections.map((s) => [s.title, s.trades.map((t) => t.id)])).toEqual([
      ["Needs you", [1, 4]],
      ["In progress", [3]],
      ["Waiting on them", [2]],
      ["History", [5, 6]],
    ]);
  });
});

describe("ask param prefills the tray from a shared deck (#1362)", () => {
  it("round-trips and drops malformed or non-positive entries (#1362)", () => {
    expect(parseAskParam(buildAskParam([{ cardId: "OP01-001", qty: 2 }, { cardId: "ST01-002", qty: 1 }]))).toEqual([
      { cardId: "OP01-001", qty: 2 },
      { cardId: "ST01-002", qty: 1 },
    ]);
    expect(parseAskParam("OP01-001:0,:3,ST01-002:x,OP01-003:1.5,OP02-004:3")).toEqual([{ cardId: "OP02-004", qty: 3 }]);
  });

  it("never asks for more copies than the friend has spare (#1362)", () => {
    const lines = askToLines([{ cardId: "OP01-001", qty: 5 }], [spare("OP01-001", { spare: 2, base_owned: 2 })]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ side: "get", cardId: "OP01-001", qty: 2 });
  });

  it("only offers the copies still missing, limited by the friend's spare (#1362)", () => {
    const asks = askableFromDeck(
      [
        { card_id: "A", my_still_need: 3 },
        { card_id: "B", my_still_need: 1 },
        { card_id: "C", my_still_need: 2 },
      ],
      [spare("A", { spare: 2 }), spare("B", { spare: 4 })],
    );
    expect(asks).toEqual([
      { cardId: "A", qty: 2 },
      { cardId: "B", qty: 1 },
    ]);
  });
});

describe("friend header 'you need' count (#1362)", () => {
  it("counts copies of their spares that are on my Shopping list, not their total (#1362)", () => {
    expect(youNeedCopies([spare("A", { spare: 3, want: 1 }), spare("B", { spare: 1, want: 4 })])).toBe(2);
  });
});

describe("undo delay (#1362)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("waits for the delay, fires once, and does not fire when cancelled (#1362)", () => {
    const fn = vi.fn();
    const call = createDelayedCall(fn, 5000);
    vi.advanceTimersByTime(4999);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10000);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(call.cancel()).toBe(false);

    const undone = vi.fn();
    const c2 = createDelayedCall(undone, 5000);
    expect(c2.cancel()).toBe(true);
    vi.advanceTimersByTime(10000);
    expect(undone).not.toHaveBeenCalled();
  });

  it("flush runs the call immediately, once (#1362)", () => {
    const fn = vi.fn();
    const call = createDelayedCall(fn, 5000);
    call.flush();
    call.flush();
    vi.advanceTimersByTime(10000);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
