// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { PrintingView } from "../../api";
import { BuySplit, BuySplitEditor, buySplitActionLabel, buySplitCaption, type BuySplitCard } from "./BuySplit";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const roots: Root[] = [];
afterEach(() => {
  act(() => roots.forEach((r) => r.unmount()));
  roots.length = 0;
  document.body.innerHTML = "";
});

const alt = (id: number, price: number, wanted = 0): PrintingView => ({
  product_id: id,
  name: `Alt ${id}`,
  market_price: price,
  low_price: null,
  image_url: "",
  tcgplayer_url: "",
  group_name: "",
  is_special: true,
  wanted,
  owned: 0,
});

const card = (still: number, alts: PrintingView[]): BuySplitCard => ({
  card_id: "EB01-002",
  name: "Izo",
  image_url: "b.jpg",
  market_price: 1,
  still_need: still,
  alt_arts: alts,
});

function mount(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>));
  return host;
}

const inc = (host: ParentNode, id: number) => host.querySelector<HTMLButtonElement>(`button[aria-label='Increase Alt ${id} to buy']`)!;

describe("BuySplitEditor (#906)", () => {
  it("Base shows what the alt picks leave and + on an alt asks for one more of it (#906)", () => {
    const picked: [number, number][] = [];
    const host = mount(<BuySplitEditor card={card(3, [alt(1, 10, 1), alt(2, 20)])} onPick={(id, q) => picked.push([id, q])} />);
    expect(host.querySelector("[aria-label='Base copies to buy']")?.textContent).toBe("×2");
    expect(host.querySelector(".buy-split-title")?.textContent).toBe("Buy your 3 copies as…");
    act(() => inc(host, 2).click());
    expect(picked).toEqual([[2, 1]]);
  });

  it("a blocked + does nothing when pressed (#906)", () => {
    const picked: [number, number][] = [];
    const host = mount(<BuySplitEditor card={card(1, [alt(1, 10, 1)])} onPick={(id, q) => picked.push([id, q])} />);
    act(() => inc(host, 1).click());
    expect(picked).toEqual([]);
  });

  it("+ is disabled on every alt, with the reason, once Base is 0 (#906)", () => {
    const host = mount(<BuySplitEditor card={card(2, [alt(1, 10, 1), alt(2, 20, 1)])} onPick={() => {}} />);
    expect(host.querySelector("[aria-label='Base copies to buy']")?.textContent).toBe("×0");
    expect(inc(host, 1).getAttribute('aria-disabled')).toBe('true');
    expect(inc(host, 2).getAttribute('aria-disabled')).toBe('true');
    expect(inc(host, 1).title).toBe("All 2 still-needed copies are already picked");
    expect(host.querySelector("button[aria-label='Decrease Alt 1 to buy']")!.getAttribute("aria-disabled")).toBe("false");
  });

  it("the footer totals the alt picks at their own price and the rest at base (#906)", () => {
    const host = mount(<BuySplitEditor card={card(3, [alt(1, 10, 1), alt(2, 20, 1)])} onPick={() => {}} />);
    // 10 + 20 + 1 base copy at $1.00
    expect(host.querySelector(".buy-split-total")?.textContent).toBe("Total$31.00");
  });

  it("owned picked alt copies are not counted against Base, the caption or the total again (#908)", () => {
    // Need 4, pick 2 of Alt 1, own both: still_need 2 is all base.
    const owned = { ...alt(1, 10, 2), owned: 2 };
    const host = mount(<BuySplitEditor card={card(2, [owned])} onPick={() => {}} />);
    expect(host.querySelector("[aria-label='Base copies to buy']")?.textContent).toBe("×2");
    expect(host.querySelector(".buy-split-total")?.textContent).toBe("Total$2.00");
    expect(buySplitCaption(card(2, [owned]))).toBeNull();
  });

  it("the caption names the alt and base copies, and is empty with no picks (#906)", () => {
    expect(buySplitCaption(card(2, [alt(1, 10, 1)]))).toBe("1 alt + 1 base");
    expect(buySplitCaption(card(2, [alt(1, 10, 2)]))).toBe("2 alt");
    expect(buySplitCaption(card(2, [alt(1, 10, 0)]))).toBeNull();
  });
});

describe("BuySplit action line (#1166)", () => {
  it("the label says Choose arts with no picks and lists the picks once there are some (#1166)", () => {
    expect(buySplitActionLabel(card(2, [alt(1, 10, 0)]))).toBe("Choose arts");
    expect(buySplitActionLabel(card(2, [alt(1, 10, 1)]))).toBe("Arts: 1 alt + 1 base");
    expect(buySplitActionLabel(card(2, [alt(1, 10, 2)]))).toBe("Arts: 2 alt");
  });

  it("the label is the collector copy when nothing is left to buy (#1166)", () => {
    expect(buySplitActionLabel(card(0, [alt(1, 10, 0)]))).toBe("★ Collector copy");
  });

  it("the trigger shows the action line and names what it does (#1166)", () => {
    const idle = mount(<BuySplit card={card(2, [alt(1, 10)])} amount="$2.00" prefix="Left " onPick={() => {}} />);
    const btn = idle.querySelector("button")!;
    expect(btn.querySelector(".buy-split-action")?.textContent).toBe("Choose arts");
    expect(btn.querySelector("svg.buy-split-icon")?.getAttribute("aria-hidden")).toBe("true");
    expect(btn.title).toBe("Choose which arts to buy for Izo");
    const picked = mount(<BuySplit card={card(2, [alt(1, 10, 1)])} amount="$11.00" onPick={() => {}} />);
    expect(picked.querySelector("button .buy-split-action")?.textContent).toBe("Arts: 1 alt + 1 base");
  });

  it("with nothing left to buy the trigger offers a collector copy (#1166)", () => {
    const host = mount(<BuySplit card={card(0, [alt(1, 10)])} amount="$0.00" onPick={() => {}} onCollectorPick={() => {}} />);
    const btn = host.querySelector("button")!;
    expect(btn.querySelector(".buy-split-action")?.textContent).toBe("★ Collector copy");
    expect(btn.title).toBe("Add a collector copy of Izo");
  });
});

describe("BuySplit trigger (#906)", () => {
  it("is a button with the amount only when the card has alt arts and copies still to buy (#906)", () => {
    const withAlts = mount(<BuySplit card={card(2, [alt(1, 10)])} amount="$2.00" onPick={() => {}} />);
    expect(withAlts.querySelector("button")?.textContent).toContain("$2.00");
    expect(withAlts.querySelector("button")?.textContent).toContain("▾");
    const noAlts = mount(<BuySplit card={card(2, [])} amount="$2.00" onPick={() => {}} />);
    expect(noAlts.querySelector("button")).toBeNull();
    expect(noAlts.textContent).toContain("$2.00");
    const done = mount(<BuySplit card={card(0, [alt(1, 10)])} amount="$0.00" onPick={() => {}} />);
    expect(done.querySelector("button")).toBeNull();
    expect(done.textContent).toContain("$0.00");
  });

  it("opens a named dialog with the editor inside (#906)", async () => {
    const host = mount(<BuySplit card={card(2, [alt(1, 10)])} amount="$2.00" onPick={() => {}} />);
    await act(async () => host.querySelector("button")!.click());
    await act(async () => new Promise((r) => setTimeout(r, 40)));
    const panel = document.querySelector("[role='dialog']");
    expect(panel?.getAttribute("aria-label")).toBe("Buy Izo as");
    expect(panel?.querySelector(".buy-split-editor")).not.toBeNull();
  });
});
