// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { api, type PriceAlert, type PrintingView } from "./api";
import { CardLightboxActionContext } from "./CardThumb";
import { AltArtsRow } from "./MarketPrice";
import {
  alertStatus,
  artPrice,
  BellBadge,
  defaultTargetPrice,
  LightboxPriceAlertControl,
  NotificationsBell,
  parseTarget,
} from "./PriceAlerts";

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean; ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.restoreAllMocks();
});

const wait = () => new Promise((r) => setTimeout(r, 120));

async function mount(node: ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => root!.render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>));
  await act(async () => {
    await wait();
  });
}

const alert = (over: Partial<PriceAlert> = {}): PriceAlert => ({
  id: 1,
  card_id: "OP01-001",
  product_id: 0,
  card_name: "Luffy",
  art_name: "Base",
  image_url: "",
  tcgplayer_url: "",
  is_alt: false,
  current_price: 4.2,
  target_price: 5,
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

describe("alert status chip (#855)", () => {
  it("a disarmed alert that fired shows the day it hit and the price (#855)", () => {
    const s = alertStatus(
      alert({ armed: false, triggered_at: "2026-11-02T15:00:00Z", triggered_price: 4.2, current_price: 3.1, met_now: true }),
    );
    expect(s.label).toBe("Hit Nov 2 at $4.20");
  });

  it("an alert already past its target at creation says so, and an untouched one is Watching (#855)", () => {
    expect(alertStatus(alert({ armed: false, met_now: true })).label).toBe("Already below target");
    expect(alertStatus(alert({ armed: false, met_now: true, direction: "above" })).label).toBe("Already above target");
    expect(alertStatus(alert()).label).toBe("Watching");
  });

  it("paused wins over a fired alert (#855)", () => {
    expect(alertStatus(alert({ paused: true, armed: false, triggered_at: "2026-11-02T15:00:00Z" })).label).toBe("Paused");
  });
});

describe("alert target helpers (#855)", () => {
  it("the suggested target is 10% under for Below and 10% over for Above, to the cent (#855)", () => {
    expect(defaultTargetPrice(5, "below")).toBe("4.50");
    expect(defaultTargetPrice(5, "above")).toBe("5.50");
    expect(defaultTargetPrice(3.33, "below")).toBe("3.00");
    expect(defaultTargetPrice(null, "below")).toBe("");
  });

  it("a target must be above $0 and at most $100000 (#855)", () => {
    expect(parseTarget("4.5")).toBe(4.5);
    expect(parseTarget("$12")).toBe(12);
    expect(parseTarget("0")).toBeNull();
    expect(parseTarget("-1")).toBeNull();
    expect(parseTarget("abc")).toBeNull();
    expect(parseTarget("100001")).toBeNull();
    expect(parseTarget("100000")).toBe(100000);
  });

  it("the base art is priced from the plain printing, an alt from its own printing (#855)", () => {
    const p = (product_id: number, is_special: boolean, market_price: number): PrintingView => ({
      product_id, name: "n", market_price, low_price: null, image_url: "", tcgplayer_url: "", group_name: "", is_special,
    });
    const list = [p(1, false, 2), p(2, true, 40)];
    expect(artPrice(list, 0)).toBe(2);
    expect(artPrice(list, 2)).toBe(40);
  });
});

describe("lightbox price alert per art (#855)", () => {
  it("a tile's lightbox gets that tile's product id: 0 for Base, the printing id for an alt (#855)", async () => {
    const seen: Array<[string, number | undefined]> = [];
    const alt: PrintingView = {
      product_id: 700001, name: "Alt art", market_price: 9, low_price: null,
      image_url: "https://tcgplayer-cdn.tcgplayer.com/product/700001_200w.jpg", tcgplayer_url: "", group_name: "", is_special: true,
    };
    await mount(
      <CardLightboxActionContext.Provider
        value={(cardId, productId) => {
          seen.push([cardId, productId]);
          return null;
        }}
      >
        <AltArtsRow
          alts={[alt]}
          cardId="OP01-001"
          base={{ name: "Luffy", market_price: 1, product_id: 1, image_url: "https://tcgplayer-cdn.tcgplayer.com/product/1_200w.jpg" } as never}
        />
      </CardLightboxActionContext.Provider>,
    );
    const btns = document.querySelectorAll<HTMLButtonElement>(".alt-art .thumb-btn");
    expect(btns).toHaveLength(2);
    for (const b of btns) {
      await act(async () => {
        b.click();
        await wait();
      });
      await act(async () => {
        document.querySelector<HTMLButtonElement>(".lightbox-close")!.click();
        await wait();
      });
    }
    expect(seen.map((s) => s[1])).toContain(0);
    expect(seen.map((s) => s[1])).toContain(700001);
    expect(seen.map((s) => s[1])).not.toContain(undefined);
  });

  it("an alert set on an alt art does not show up on the base art, and vice versa (#855)", async () => {
    vi.spyOn(api, "priceAlerts").mockResolvedValue({
      alerts: [alert({ id: 7, product_id: 700001, target_price: 30, art_name: "Alt art", is_alt: true })],
      email_enabled: false,
    });
    await mount(
      <>
        <div id="base"><LightboxPriceAlertControl cardId="OP01-001" productId={0} /></div>
        <div id="alt"><LightboxPriceAlertControl cardId="OP01-001" productId={700001} /></div>
      </>,
    );
    expect(document.querySelector("#base")!.textContent).toContain("Price alert");
    expect(document.querySelector("#base")!.textContent).not.toContain("Alert: below");
    expect(document.querySelector("#alt")!.textContent).toContain("Alert: below $30.00");
  });
});

describe("notifications bell (#855)", () => {
  it("BellBadge shows the unread count and nothing at zero (#855)", async () => {
    await mount(<BellBadge unread={3} />);
    expect(host!.textContent).toBe("3");
    act(() => root!.render(<BellBadge unread={0} />));
    expect(host!.textContent).toBe("");
  });

  it("the bell takes its unread count from the notifications endpoint (#855)", async () => {
    vi.spyOn(api, "notifications").mockResolvedValue({ items: [], unread: 4 });
    await mount(<NotificationsBell />);
    expect(host!.querySelector(".bell-badge")?.textContent).toBe("4");
    expect(host!.querySelector("button")!.getAttribute("aria-label")).toBe("Notifications, 4 unread");
  });
});
