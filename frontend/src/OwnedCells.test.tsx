// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, type PrintingView } from "./api";
import { baseTileFor } from "./altArt";
import { AltArtsRow } from "./MarketPrice";
import {
  OwnedCell,
  OwnedStepper,
  StillNeededCell,
  ownedCellIsTotal,
  stillNeededText,
  totalOwned,
} from "./OwnedCells";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Unmount every root before jsdom is torn down, so React has no work left to run without a window.
const mounted: { root: Root; client: QueryClient }[] = [];

afterEach(() => {
  act(() => {
    for (const { root } of mounted) root.unmount();
  });
  for (const { client } of mounted) client.clear();
  mounted.length = 0;
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

function mount(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient();
  mounted.push({ root, client });
  act(() => {
    root.render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
  });
  return host;
}

const alt: PrintingView = {
  product_id: 7,
  name: "Linlin alt",
  market_price: null,
  low_price: null,
  image_url: "alt.jpg",
  tcgplayer_url: "",
  group_name: "",
  is_special: true,
  owned: 1,
};

describe("Owned shows the total including alt arts (#652)", () => {
  it("totalOwned adds the alt copies to the base count (#652)", () => {
    expect(totalOwned(2, 1)).toBe(3);
    expect(totalOwned(2, undefined)).toBe(2);
  });

  it("the Owned cell is a read-only total, not a stepper, when editable alt tiles are shown (#652)", () => {
    const host = mount(
      <OwnedCell isTotal owned={2} altsOwned={1} stepper={<input className="owned" defaultValue="2" />} />,
    );
    expect(host.querySelector(".owned-total-num")?.textContent).toBe("3");
    expect(host.querySelector(".owned-total-split")?.textContent).toBe("2 base + 1 alt");
    expect(host.querySelector("[aria-label='3 owned in total; change counts under each art']")).not.toBeNull();
    expect(host.querySelector("input")).toBeNull();
  });

  it("without alt tiles the Owned cell keeps its stepper and a +N alt note (#652)", () => {
    const host = mount(
      <OwnedCell isTotal={false} owned={2} altsOwned={1} stepper={<input className="owned" defaultValue="2" />} />,
    );
    expect(host.querySelector("input.owned")).not.toBeNull();
    expect(host.querySelector(".owned-total")).toBeNull();
    expect(host.querySelector(".alts-owned-note")?.textContent).toBe("+1 alt");
  });

  it("the total only replaces the stepper when the alt tiles are shown, present and editable (#652)", () => {
    expect(ownedCellIsTotal(true, 1, true)).toBe(true);
    expect(ownedCellIsTotal(false, 1, true)).toBe(false);
    expect(ownedCellIsTotal(true, 0, true)).toBe(false);
    expect(ownedCellIsTotal(true, 1, false)).toBe(false);
  });
});

describe("Still needed shows how many more (#652)", () => {
  it("the cell shows the count with the deck need underneath, not 5/8 (#652)", () => {
    const host = mount(<StillNeededCell still={5} need={8} />);
    expect(host.querySelector(".still-need-num")?.textContent).toBe("5");
    expect(host.querySelector(".still-need-of")?.textContent).toBe("of 8");
    expect(host.textContent).not.toContain("5/8");
  });

  it("meta text says how many more are needed, or that you have them all (#652)", () => {
    expect(stillNeededText(5, 8)).toBe("Still need 5 of 8");
    expect(stillNeededText(0, 8)).toBe("Have all 8");
  });
});

describe("Base tile owned stepper (#652)", () => {
  function renderRow(baseOwned: number, onSaved = () => {}, applyOptimistic = vi.fn()) {
    const card = {
      name: "Charlotte Linlin",
      image_url: "base.jpg",
      market_price: 1,
      product_id: 1,
      alt_arts: [alt],
    };
    return mount(
      <AltArtsRow
        alts={[alt]}
        cardId="OP03-099"
        editable
        onOwnedChange={() => {}}
        base={baseTileFor(card, true)}
        baseOwnedControl={
          <OwnedStepper
            compact
            name={card.name}
            cardId="OP03-099"
            value={baseOwned}
            onSaved={onSaved}
            applyOptimistic={applyOptimistic}
          />
        }
      />,
    );
  }

  it("the Base tile has an Owned stepper that saves the base count, not the total (#652)", async () => {
    const setOwned = vi.spyOn(api, "setOwned").mockResolvedValue({ qty: 3 } as never);
    const host = renderRow(2);
    const tile = host.querySelector(".alt-art-base")!;
    expect(tile.querySelector(".alt-want-caption")?.textContent).toBe("Owned");
    expect(tile.querySelector(".alt-base-label")?.textContent).toBe("Base");
    expect(tile.querySelector(".alt-want-qty")?.textContent).toBe("2");

    const inc = tile.querySelector<HTMLButtonElement>("[aria-label='Increase owned for Charlotte Linlin base art']")!;
    await act(async () => {
      inc.click();
    });
    expect(setOwned).toHaveBeenCalledTimes(1);
    expect(setOwned).toHaveBeenCalledWith("OP03-099", 3);
  });

  it("the alt tile stepper stays separate from the Base tile stepper (#652)", () => {
    const host = renderRow(2);
    const tiles = host.querySelectorAll(".alt-art");
    expect(tiles).toHaveLength(2);
    expect(tiles[0]!.querySelector(".alt-want-qty")?.textContent).toBe("2");
    expect(tiles[1]!.querySelector(".alt-want-qty")?.textContent).toBe("1");
  });

  it("baseTileFor keeps the Base tile with no owned alt only when asked to (#652)", () => {
    const card = { name: "X", image_url: "x.jpg", market_price: 1, alt_arts: [{ ...alt, owned: 0 }] };
    expect(baseTileFor(card)).toBeNull();
    expect(baseTileFor(card, true)?.name).toBe("X");
  });
});
