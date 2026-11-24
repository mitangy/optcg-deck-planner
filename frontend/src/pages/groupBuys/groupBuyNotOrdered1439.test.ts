import { describe, expect, it } from "vitest";
import type { GroupBuyLine } from "../../api";
import { notOrderedArt, notOrderedWho } from "./groupBuyOrders";

const ALT = { product_id: 1009, name: "Parallel", image_url: "https://img/1009.jpg" };
const line = (over: Partial<GroupBuyLine>) =>
  ({
    card_id: "OP01-001",
    name: "Luffy",
    image_url: "https://img/1001.jpg",
    base_image_url: "https://img/1001.jpg",
    alt_arts: [ALT],
    members: [],
    ...over,
  }) as unknown as GroupBuyLine;
const m = (display_name: string, qty: number, product_id: number | null = null) => ({ user_id: display_name.length, display_name, qty, product_id });

describe("not in an order yet: who the copies are for (#1439)", () => {
  it("lists each member with their copies (#1439)", () => {
    expect(notOrderedWho(line({ not_ordered_members: [m("Nami", 1), m("Zoro", 2)] }))).toEqual(["Nami ×1", "Zoro ×2"]);
  });

  it("names an alt art, and marks the standard copies Base once an alt is in the mix (#1439)", () => {
    expect(notOrderedWho(line({ not_ordered_members: [m("Zoro", 1, 1009), m("Zoro", 1), m("Nami", 1)] }))).toEqual([
      "Zoro ×1 (Parallel)",
      "Zoro ×1 (Base)",
      "Nami ×1 (Base)",
    ]);
  });

  it("is empty when the server sent no breakdown (#1439)", () => {
    expect(notOrderedWho(line({}))).toEqual([]);
  });
});

describe("not in an order yet: the art shown (#1439)", () => {
  it("shows the alt art when most missing copies are that alt (#1439)", () => {
    expect(notOrderedArt(line({ not_ordered_members: [m("Zoro", 2, 1009), m("Nami", 1)] }))).toBe("https://img/1009.jpg");
  });

  it("shows the usual art when most missing copies are standard (#1439)", () => {
    expect(notOrderedArt(line({ not_ordered_members: [m("Zoro", 1, 1009), m("Nami", 2)] }))).toBe("https://img/1001.jpg");
  });
});
