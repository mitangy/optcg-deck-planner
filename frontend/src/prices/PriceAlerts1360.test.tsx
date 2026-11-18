// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { api, type PriceAlert } from "../api";
import { BottomNav } from "../app/primaryNav";
import { PriceAlertsPage } from "./PriceAlerts";

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
  await act(async () =>
    root!.render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>{node}</MemoryRouter>
      </QueryClientProvider>,
    ),
  );
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
  tcgplayer_url: "https://www.tcgplayer.com/product/1",
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

const row = (id: number) => document.querySelector<HTMLElement>(`[data-alert-id="${id}"]`)!;
const click = async (el: Element | null | undefined) => {
  await act(async () => {
    (el as HTMLElement).click();
    await wait();
  });
};

async function mountPage(alerts: PriceAlert[], emailEnabled = true) {
  vi.spyOn(api, "priceAlerts").mockResolvedValue({ alerts, email_enabled: emailEnabled });
  await mount(<PriceAlertsPage renderSearch={() => null} />);
}

describe("alerts page rows (#1360)", () => {
  it("Buy on TCGPlayer shows on hit and already-met rows only, and opens the alert's TCGPlayer page (#1360)", async () => {
    await mountPage([
      alert({ id: 1, armed: false, triggered_at: "2026-11-16T10:00:00Z", triggered_price: 78 }),
      alert({ id: 2, armed: false, met_now: true }),
      alert({ id: 3 }),
      alert({ id: 4, paused: true }),
      alert({ id: 5, armed: false, triggered_at: "2026-11-16T10:00:00Z", tcgplayer_url: "" }),
    ]);
    const buy = (id: number) => row(id).querySelector<HTMLAnchorElement>("a.alert-buy");
    expect(buy(1)?.getAttribute("href")).toBe("https://www.tcgplayer.com/product/1");
    expect(buy(1)?.getAttribute("rel")).toContain("noreferrer");
    expect(buy(2)).not.toBeNull();
    expect(buy(3)).toBeNull();
    expect(buy(4)).toBeNull();
    expect(buy(5)).toBeNull();
  });

  it("Delete asks first and only calls the API after Delete is confirmed (#1360)", async () => {
    const del = vi.spyOn(api, "deletePriceAlert").mockResolvedValue(undefined as never);
    await mountPage([alert({ id: 7, card_name: "Boa Hancock - OP14-041", card_id: "OP14-041" })]);
    await click(row(7).querySelector(".alert-act-delete"));
    expect(del).not.toHaveBeenCalled();
    const dialog = document.querySelector('[role="alertdialog"]')!;
    expect(dialog.textContent).toContain("Delete this alert?");
    expect(dialog.textContent).toContain("Boa Hancock");
    const cancel = [...dialog.querySelectorAll("button")].find((b) => b.textContent === "Cancel");
    await click(cancel);
    expect(del).not.toHaveBeenCalled();
    await click(row(7).querySelector(".alert-act-delete"));
    const confirm = [...document.querySelectorAll('[role="alertdialog"] button')].find((b) => b.textContent === "Delete");
    await click(confirm);
    expect(del).toHaveBeenCalledTimes(1);
    expect(del.mock.calls[0][0]).toBe(7);
  });

  it("with email off the Email box is disabled and says Email is off (#1360)", async () => {
    await mountPage([alert({ id: 1 })], false);
    const box = row(1).querySelector<HTMLInputElement>(".alert-toggles input[type=checkbox]")!;
    expect(box.disabled).toBe(true);
    expect(row(1).querySelector(".alert-toggles")!.textContent).toContain("Email is off");
  });

  it("with email on the Email box works and is labelled Email (#1360)", async () => {
    await mountPage([alert({ id: 1 })], true);
    const box = row(1).querySelector<HTMLInputElement>(".alert-toggles input[type=checkbox]")!;
    expect(box.disabled).toBe(false);
    expect(row(1).querySelector(".alert-toggles")!.textContent).toContain("Email");
    expect(row(1).querySelector(".alert-toggles")!.textContent).not.toContain("Email is off");
  });

  it("the page head says how many alerts hit in the last 7 days (#1360)", async () => {
    const recent = new Date(Date.now() - 2 * 86_400_000).toISOString();
    await mountPage([alert({ id: 1, armed: false, triggered_at: recent }), alert({ id: 2 })]);
    expect(document.querySelector(".alerts-hits")?.textContent).toBe("1 hit in the last 7 days");
  });

  it("the card name links to its card page (#1360)", async () => {
    await mountPage([alert({ id: 1, card_id: "OP01-001" })]);
    expect(row(1).querySelector("a.alert-card-name")?.getAttribute("href")).toBe("/cards/OP01-001");
  });
});

describe("phone More tab dot (#1360)", () => {
  it("the More tab shows a dot and says so when notifications are unread (#1360)", async () => {
    vi.spyOn(api, "notifications").mockResolvedValue({ items: [], unread: 3 });
    await mount(<BottomNav />);
    const more = document.querySelector<HTMLElement>(".bottom-nav-more")!;
    expect(more.querySelector(".nav-unread-dot")).not.toBeNull();
    expect(more.getAttribute("aria-label")).toContain("3 unread");
  });

  it("no dot when everything is read (#1360)", async () => {
    vi.spyOn(api, "notifications").mockResolvedValue({ items: [], unread: 0 });
    await mount(<BottomNav />);
    expect(document.querySelector(".bottom-nav-more .nav-unread-dot")).toBeNull();
  });
});
