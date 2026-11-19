// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, type PrintingView } from "../../api";
import { baseTileFor } from "../../cards/altArt";
import { AltArtsRow } from "../../cards/MarketPrice";
import {
  OwnedCell,
  OwnedStepper,
  StillNeededCell,
  toBuyText,
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

  it("the Owned cell keeps its stepper for the base art and shows the alt copies and total beside it (#1342)", () => {
    const host = mount(<OwnedCell owned={2} altsOwned={1} stepper={<input className="owned" defaultValue="2" />} />);
    expect(host.querySelector("input.owned")).not.toBeNull();
    expect(host.querySelector(".alts-owned-note")?.textContent).toBe("+1 alt · 3 total");
  });

  it("with editable alt tiles the Owned cell shows the read-only total and a base/alt breakdown, no stepper (#1379)", () => {
    const host = mount(<OwnedCell owned={1} altsOwned={2} editedInTiles stepper={<input className="owned" defaultValue="1" />} />);
    expect(host.querySelector("input")).toBeNull();
    const total = host.querySelector(".owned-total");
    expect(total?.textContent).toBe("3");
    expect(total?.getAttribute("aria-label")).toBe("3 owned in total");
    expect(host.querySelector(".alts-owned-note")?.textContent).toBe("1 base · 2 alts");
  });

  it("with editable tiles and one alt the breakdown says alt, and with no alts owned it shows only the total (#1379)", () => {
    const one = mount(<OwnedCell owned={4} altsOwned={1} editedInTiles stepper={null} />);
    expect(one.querySelector(".alts-owned-note")?.textContent).toBe("4 base · 1 alt");
    const none = mount(<OwnedCell owned={4} altsOwned={0} editedInTiles stepper={null} />);
    expect(none.querySelector(".owned-total")?.textContent).toBe("4");
    expect(none.querySelector(".alts-owned-note")).toBeNull();
  });

  it("without alt copies the Owned cell shows only the stepper (#1342)", () => {
    const host = mount(<OwnedCell owned={2} stepper={<input className="owned" defaultValue="2" />} />);
    expect(host.querySelector("input.owned")).not.toBeNull();
    expect(host.querySelector(".alts-owned-note")).toBeNull();
  });
});

describe("Still needed shows how many more (#652)", () => {
  it("the cell shows the count with the deck need underneath, not 5/8 (#652)", () => {
    const host = mount(<StillNeededCell still={5} need={8} />);
    expect(host.querySelector(".still-need-num")?.textContent).toBe("5");
    expect(host.querySelector(".still-need-of")?.textContent).toBe("of 8");
    expect(host.textContent).not.toContain("5/8");
  });

  it("meta text says how many to buy, or that you have them all (#652)", () => {
    expect(toBuyText(5, 8)).toBe("To buy 5 of 8");
    expect(toBuyText(0, 8)).toBe("Have all 8");
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
