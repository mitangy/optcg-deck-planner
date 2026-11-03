// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { CardLightboxActionContext } from "./CardThumb";
import { GridCard, MobileCard } from "./PlannerCard";

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const ALT = 700001;

async function openMainArt(node: ReactNode): Promise<Array<[string, number | undefined]>> {
  const seen: Array<[string, number | undefined]> = [];
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <CardLightboxActionContext.Provider
        value={(cardId, productId) => {
          seen.push([cardId, productId]);
          return null;
        }}
      >
        {node}
      </CardLightboxActionContext.Provider>,
    ),
  );
  await act(async () => {
    host!.querySelector<HTMLButtonElement>(".thumb-btn")!.click();
  });
  return seen;
}

describe("lightbox price alert follows the main art (#896)", () => {
  it("a grid card showing an alt art opens its lightbox for that alt's product id (#896)", async () => {
    const seen = await openMainArt(
      <GridCard cardId="OP01-001" name="Luffy" imageSrc="https://x/700001_400w.jpg" imageProductId={ALT} />,
    );
    expect(seen.at(-1)).toEqual(["OP01-001", ALT]);
  });

  it("a phone card showing an alt art opens its lightbox for that alt's product id (#896)", async () => {
    const seen = await openMainArt(
      <MobileCard cardId="OP01-001" name="Luffy" imageSrc="https://x/700001_400w.jpg" imageProductId={ALT} cost={5} />,
    );
    expect(seen.at(-1)).toEqual(["OP01-001", ALT]);
  });
});
