// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrintingView } from "../../api";
import { BuySplit, type BuySplitCard } from "../shopping/BuySplit";
import { CollectorStepper, UndoToast } from "./CollectorLine";

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
  vi.useRealTimers();
});

const alt = (id: number, collector = 0): PrintingView => ({
  product_id: id,
  name: `Alt ${id}`,
  market_price: 10,
  low_price: null,
  image_url: "",
  tcgplayer_url: "",
  group_name: "",
  is_special: true,
  wanted: 0,
  owned: 0,
  collector,
});

const card = (still: number, alts: PrintingView[]): BuySplitCard => ({
  card_id: "EB05-055",
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

const click = (el: Element | null) => act(() => el!.dispatchEvent(new MouseEvent("click", { bubbles: true })));

describe("Master Shopping collector picker (#1031)", () => {
  it("the price opens at Still 0 with only the collector picker, and Pick adds one copy (#1031)", () => {
    const picks: [number, number][] = [];
    const host = mount(
      <BuySplit card={card(0, [alt(1), alt(2, 1)])} amount="$0.00" onPick={() => {}} onCollectorPick={(p, q) => picks.push([p, q])} />,
    );
    const trigger = host.querySelector<HTMLButtonElement>("button[data-buy-split]");
    expect(trigger).not.toBeNull();
    click(trigger);
    const panel = document.body.querySelector("[role='dialog']")!;
    // Nothing is left to buy: no split rows or total, only the picker (open from the start).
    expect(panel.textContent).not.toContain("Total");
    expect(panel.querySelector("button[aria-label^='Increase']")).toBeNull();
    expect(panel.textContent).toContain("Want an extra copy too");
    click(panel.querySelector("button[aria-label='Pick Alt 1 as a collector copy']"));
    expect(picks).toEqual([[1, 1]]);
    // An art that already has a collector copy shows Added instead of Pick.
    expect(panel.querySelector("button[aria-label='Pick Alt 2 as a collector copy']")).toBeNull();
    expect(panel.textContent).toContain("★ Added");
  });

  it("without the collector wiring, a card with nothing left to buy keeps a plain price (#1031)", () => {
    const host = mount(<BuySplit card={card(0, [alt(1)])} amount="$0.00" onPick={() => {}} />);
    expect(host.querySelector("button[data-buy-split]")).toBeNull();
    expect(host.textContent).toBe("$0.00");
  });

  it("with copies still to buy the split stays first and the picker waits behind its toggle (#1031)", () => {
    const host = mount(<BuySplit card={card(2, [alt(1)])} amount="$2.00" onPick={() => {}} onCollectorPick={() => {}} />);
    click(host.querySelector("button[data-buy-split]"));
    const panel = document.body.querySelector("[role='dialog']")!;
    expect(panel.textContent).toContain("Buy your 2 copies as");
    expect(panel.querySelector("button[aria-label='Pick Alt 1 as a collector copy']")).toBeNull();
    click(panel.querySelector(".collector-add-toggle"));
    expect(panel.querySelector("button[aria-label='Pick Alt 1 as a collector copy']")).not.toBeNull();
  });
});

describe("collector line controls (#1031)", () => {
  it("the minus stops at 1 and the plus asks for one more of that printing (#1031)", () => {
    const changes: number[] = [];
    const host = mount(<CollectorStepper line={{ label: "Gold-stamped", want: 1 }} busy={false} onChange={(q) => changes.push(q)} />);
    const minus = host.querySelector<HTMLButtonElement>("button[aria-label='Want one fewer Gold-stamped collector copy']")!;
    expect(minus.disabled).toBe(true);
    click(host.querySelector("button[aria-label='Want one more Gold-stamped collector copy']"));
    expect(changes).toEqual([2]);
    const two = mount(<CollectorStepper line={{ label: "Gold-stamped", want: 2 }} busy={false} onChange={(q) => changes.push(q)} />);
    click(two.querySelector("button[aria-label='Want one fewer Gold-stamped collector copy']"));
    expect(changes).toEqual([2, 1]);
  });

  it("the Undo toast hides itself after a few seconds and Undo runs its action (#1031)", () => {
    vi.useFakeTimers();
    const dismissed: string[] = [];
    const undone: string[] = [];
    const host = mount(
      <UndoToast message="Removed" onAction={() => undone.push("undo")} onDismiss={() => dismissed.push("hide")} ms={6000} />,
    );
    click(host.querySelector("button"));
    expect(undone).toEqual(["undo"]);
    act(() => void vi.advanceTimersByTime(5900));
    expect(dismissed).toEqual([]);
    act(() => void vi.advanceTimersByTime(200));
    expect(dismissed).toEqual(["hide"]);
  });
});
