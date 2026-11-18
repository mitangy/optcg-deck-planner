import { describe, expect, it } from "vitest";
import type { GroupBuyMember } from "../../api";
import { defaultListDensity } from "../../ui/CardLayout";
import { groupBuyActions, stepHint, summaryParts } from "./groupBuyActions";
import { shownArtPrice } from "./groupBuyArt";
import { buyingForText, yourShareText } from "./yourShare";

describe("group buy header actions (#1361)", () => {
  it("the host's one primary button follows the step (#1361)", () => {
    expect(groupBuyActions("open", true, false, false).primary).toBe("lock");
    expect(groupBuyActions("locked", true, false, false).primary).toBe("mark-ordered");
    expect(groupBuyActions("ordered", true, false, false).primary).toBe("import-receipt");
    expect(groupBuyActions("completed", true, false, true).primary).toBeNull();
  });

  it("an ordered pool swaps Import receipt for Mark purchased once a receipt is matched (#1361)", () => {
    expect(groupBuyActions("ordered", true, true, false).primary).toBe("mark-purchased");
  });

  it("members get no primary button and Leave sits under More (#1361)", () => {
    for (const status of ["open", "locked", "ordered", "completed"]) {
      const a = groupBuyActions(status, false, true, true);
      expect(a.primary).toBeNull();
      expect(a.more).toEqual(["leave"]);
    }
  });

  it("the invite link can only be copied while the group buy is open (#1361)", () => {
    for (const isHost of [true, false]) {
      expect(groupBuyActions("open", isHost, false, false).secondary).toContain("copy-invite");
      for (const status of ["locked", "ordered", "completed"]) {
        expect(groupBuyActions(status, isHost, false, true).secondary).not.toContain("copy-invite");
      }
    }
  });

  it("rare host actions live under More and Undo only shows when the purchase can be undone (#1361)", () => {
    expect(groupBuyActions("open", true, false, false).more).toEqual(["reset-invite", "delete"]);
    expect(groupBuyActions("locked", true, false, false).more).toEqual(["unlock", "delete"]);
    expect(groupBuyActions("completed", true, false, true).more).toEqual(["undo-purchase", "delete"]);
    expect(groupBuyActions("completed", true, false, false).more).toEqual(["delete"]);
  });

  it("the summary shows the cards figure while open and the grand total afterwards, once (#1361)", () => {
    const d = { host_name: "Nami", member_count: 3, unique_cards: 61, cards_still_needed: 200, remaining_market: 687.95, grand_total: 451.17 };
    expect(summaryParts({ ...d, status: "open" })).toMatchObject({ moneyLabel: "Cards", money: 687.95 });
    expect(summaryParts({ ...d, status: "ordered" })).toMatchObject({ moneyLabel: "Total", money: 451.17 });
  });

  it("the step hint tells the host what unlocks Mark purchased (#1361)", () => {
    expect(stepHint("ordered", true, false, false)).toMatch(/Import and match a TCGPlayer receipt/);
    expect(stepHint("ordered", true, true, true)).toMatch(/Mark purchased adds/);
  });
});

describe("group buy prices (#1361)", () => {
  const alt = { product_id: 9, name: "Manga", market_price: 40, owned: 0, wanted: 0 };
  const base = { market_price: 2, alt_arts: [alt] as never };

  it("Each is the price of the art the row shows, not the base card's (#1361)", () => {
    expect(shownArtPrice({ ...base, display_art: 9 })).toBe(40);
  });

  it("Each is the base price when no alt art is shown (#1361)", () => {
    expect(shownArtPrice({ ...base, display_art: 0 })).toBe(2);
  });
});

describe("Your share (#1361)", () => {
  const me = {
    user_id: 1,
    display_name: "Nami",
    role: "member",
    deck_ids: null,
    cards_still_needed: 51,
    remaining_market: 223.74,
    card_cost: 223.74,
    shipping_share: 5,
    tax_share: 2.38,
    total_owed: 231.12,
  } as GroupBuyMember;

  it("says how many copies you buy and what they cost while open (#1361)", () => {
    expect(yourShareText("open", me)).toBe("You're buying 51 copies · Cards $223.74");
  });

  it("says what you owe once the group buy is locked (#1361)", () => {
    expect(yourShareText("locked", me)).toBe("You owe $231.12");
    expect(yourShareText("completed", me)).toBe("You owe $231.12");
  });

  it("Buying for names the picked decks, or All decks (#1361)", () => {
    const decks = [
      { id: 1, name: "Xebec" },
      { id: 2, name: "Luffy 079" },
      { id: 3, name: "Zoro" },
    ];
    expect(buyingForText(decks, [1, 2], true, false)).toBe("Xebec, Luffy 079 · Cards not in a deck");
    expect(buyingForText(decks, null, true, true)).toBe("All decks · Cards not in a deck · Extra copies");
  });
});

describe("group buy list density (#1361)", () => {
  it("the group buy list starts Compact (#1361)", () => {
    expect(defaultListDensity("groupBuy")).toBe("compact");
  });
});
