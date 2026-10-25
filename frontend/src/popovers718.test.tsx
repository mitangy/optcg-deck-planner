// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { SortMenu, type SortKey } from "./cardListControls";
import { HeadPopover } from "./HeadPopover";
import { MarketPrice } from "./MarketPrice";

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(() => {
  vi.spyOn(api, "recentSales").mockResolvedValue({
    product_id: 9,
    sales: [{ price: 1.3, condition: "Near Mint", variant: "Normal", order_date: "2026-01-10T00:00:00Z", quantity: 1 }],
  } as never);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.restoreAllMocks();
});

const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));

async function mount(ui: ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => root!.render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>));
}

async function click(el: Element) {
  await act(async () => {
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
    }
    await wait();
  });
}

async function key(k: string) {
  await act(async () => {
    document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
    document.activeElement?.dispatchEvent(new KeyboardEvent("keyup", { key: k, bubbles: true, cancelable: true }));
    await wait();
  });
}

const byText = (sel: string, text: string) => [...document.querySelectorAll<HTMLElement>(sel)].find((e) => e.textContent?.includes(text));
const dialog = (name: string) => document.querySelector<HTMLElement>(`[role="dialog"][aria-label="${name}"]`);

function HeadHarness() {
  return (
    <div>
      <HeadPopover label="Share" panelLabel="Share and export">
        {(close) => (
          <div>
            <p>Anyone with the link</p>
            <button type="button" id="done" onClick={close}>
              Done
            </button>
          </div>
        )}
      </HeadPopover>
      <button id="elsewhere" type="button">
        Elsewhere
      </button>
    </div>
  );
}

describe("page-head popover on the shared Popover (#718)", () => {
  const trigger = () => document.querySelector<HTMLButtonElement>("button.head-popover-btn")!;

  it("the button opens a named panel in a portal and marks the wrapper open, a second press closes it (#718)", async () => {
    await mount(<HeadHarness />);
    expect(dialog("Share and export")).toBeNull();
    await click(trigger());
    const panel = dialog("Share and export")!;
    expect(panel).not.toBeNull();
    expect(host!.contains(panel)).toBe(false);
    expect(panel.className).toContain("head-popover-panel");
    expect(document.querySelector(".head-popover")!.classList.contains("open")).toBe(true);
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    await click(trigger());
    expect(dialog("Share and export")).toBeNull();
    expect(document.querySelector(".head-popover")!.classList.contains("open")).toBe(false);
  });

  it("Escape closes it and focus returns to the button (#718)", async () => {
    await mount(<HeadHarness />);
    await click(trigger());
    await key("Escape");
    expect(dialog("Share and export")).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("a click outside closes it, a click inside does not (#718)", async () => {
    await mount(<HeadHarness />);
    await click(trigger());
    await click(dialog("Share and export")!.querySelector("p")!);
    expect(dialog("Share and export")).not.toBeNull();
    await click(document.getElementById("elsewhere")!);
    expect(dialog("Share and export")).toBeNull();
  });

  it("a function child gets close, so an action inside can put the panel away (#718)", async () => {
    await mount(<HeadHarness />);
    await click(trigger());
    await click(document.getElementById("done")!);
    expect(dialog("Share and export")).toBeNull();
  });
});

describe("market price on the shared Popover (#718)", () => {
  const price = () => document.querySelector<HTMLButtonElement>("button.market-price-btn")!;
  const sales = () => document.querySelector<HTMLElement>('[role="region"][aria-label="Last 3 sold prices"]');

  it("opens the last sales in a portal on press, fetching them only then, and Escape closes it with focus back (#718)", async () => {
    await mount(<MarketPrice price={1.25} productId={9} />);
    expect(api.recentSales).not.toHaveBeenCalled();
    const btn = price();
    await click(btn);
    expect(sales()).not.toBeNull();
    expect(host!.contains(sales())).toBe(false);
    expect(api.recentSales).toHaveBeenCalledTimes(1);
    expect(sales()!.textContent).toContain("$1.30");
    expect(price()).toBe(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    await key("Escape");
    expect(sales()).toBeNull();
    expect(document.activeElement).toBe(btn);
    expect(price()).toBe(btn);
  });

  it("a click outside the sales closes them (#718)", async () => {
    await mount(
      <div>
        <MarketPrice price={1.25} productId={9} />
        <button id="elsewhere" type="button">
          Elsewhere
        </button>
      </div>,
    );
    await click(price());
    expect(sales()).not.toBeNull();
    await click(document.getElementById("elsewhere")!);
    expect(sales()).toBeNull();
  });

  it("a price with no product to look up is plain text, not a button (#718)", async () => {
    await mount(<MarketPrice price={1.25} productId={0} />);
    expect(price()).toBeNull();
    expect(host!.textContent).toBe("$1.25");
  });
});

function SortHarness() {
  const [sorts, setSorts] = useState<SortKey[]>(["color", "set"]);
  return <SortMenu sorts={sorts} onChange={setSorts} onlyNeed={false} keys={["color", "set", "price"]} />;
}

describe("sort panel on the shared Popover (#718)", () => {
  const trigger = () => document.querySelector<HTMLButtonElement>("button.sort-menu-btn")!;
  const panel = () => dialog("Sort order");
  const box = (label: string) => byText(".sort-menu-item", label)!.querySelector<HTMLInputElement>("input")!;

  it("stays open while checkboxes are toggled and rows are moved, and the summary follows (#718)", async () => {
    await mount(<SortHarness />);
    expect(trigger().textContent).toBe("Sort: Color › Set");
    await click(trigger());
    expect(panel()).not.toBeNull();
    expect(host!.contains(panel())).toBe(false);

    await click(box("Price"));
    expect(panel()).not.toBeNull();
    expect(box("Price").checked).toBe(true);
    expect(trigger().textContent).toBe("Sort: Color › Set › Price");

    await click(panel()!.querySelector<HTMLElement>('button[aria-label="Move Price up"]')!);
    expect(panel()).not.toBeNull();
    expect(trigger().textContent).toBe("Sort: Color › Price › Set");

    await click(box("Color"));
    expect(panel()).not.toBeNull();
    expect(trigger().textContent).toBe("Sort: Price › Set");
  });

  it("Escape closes it and focus returns to the Sort button (#718)", async () => {
    await mount(<SortHarness />);
    await click(trigger());
    box("Set").focus();
    await key("Escape");
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("a click outside closes it (#718)", async () => {
    await mount(
      <div>
        <SortHarness />
        <button id="elsewhere" type="button">
          Elsewhere
        </button>
      </div>,
    );
    await click(trigger());
    await click(document.getElementById("elsewhere")!);
    expect(panel()).toBeNull();
  });
});
