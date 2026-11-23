// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { GroupBuyLine, GroupBuyOrder } from "../../api";
import { CheckItemsDialog } from "./CheckItemsDialog";

const h = vi.hoisted(() => ({ summary: "" }));

vi.mock("../../app/lazyPages", () => ({
  CardScanner: ({ multi, onClose }: { multi: { collect: (c: { cardId: string }[], unread: number) => string }; onClose: () => void }) => (
    <div>
      <button
        type="button"
        onClick={() => {
          h.summary = multi.collect([{ cardId: "OP01-001" }, { cardId: "OP01-001" }, { cardId: "OP01-001" }, { cardId: "OP02-002" }], 1);
        }}
      >
        fake scan
      </button>
      <button type="button" onClick={onClose}>
        fake back
      </button>
    </div>
  ),
}));
vi.mock("../../ui/CardThumb", () => ({ CardThumb: () => null }));

const oline = (id: number, cardId: string, qty: number) => ({
  id,
  card_id: cardId,
  name: cardId === "OP01-001" ? "Luffy" : cardId,
  product_id: null,
  qty_ordered: qty,
  qty_arrived: 0,
  qty_extra: 0,
  allocations: [{ user_id: 1, display_name: "Nami", qty, qty_arrived: 0 }],
});
const order = (id: number, seller: string, lines: ReturnType<typeof oline>[]) =>
  ({ id, seller_name: seller, order_number: "", status: "on_the_way", version: 1, qty_allocated: 2, qty_arrived: 0, lines }) as unknown as GroupBuyOrder;

let root: Root | null = null;
let host: HTMLElement | null = null;
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const click = (label: string) =>
  act(async () => {
    [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(label))!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

describe("Check items scan to receive (#1418)", () => {
  it("scanned cards fill the counts and the extras list, and nothing is saved until Save (#1418)", async () => {
    const a = order(1, "Grand Line", [oline(10, "OP01-001", 2)]);
    const b = order(2, "Sabaody", [oline(20, "OP02-002", 1)]);
    const onSave = vi.fn();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(
        <CheckItemsDialog
          order={a}
          index={0}
          lines={[{ card_id: "OP01-001", name: "Luffy" } as GroupBuyLine]}
          members={[]}
          orders={[a, b]}
          saving={false}
          error={null}
          onSave={onSave}
          onClose={() => {}}
        />,
      );
    });
    await click("Scan cards");
    await click("fake scan");
    expect(h.summary).toBe("2 counted · 2 not in this order · 1 not recognised");
    expect(onSave).not.toHaveBeenCalled();
    await click("fake back");
    expect(document.querySelector('[aria-label="2 of 2 arrived"]')).not.toBeNull();
    const rows = [...document.querySelectorAll('[data-testid="gb-scan-extra"] li')].map((li) => li.textContent);
    expect(rows).toEqual(["1 × LuffyOP01-001", "1 × OP02-002OP02-002 · In Sabaody order"]);
    await click("Save · 2 of 2 arrived");
    expect(onSave).toHaveBeenCalledWith({ 10: 2 });
  });
});
