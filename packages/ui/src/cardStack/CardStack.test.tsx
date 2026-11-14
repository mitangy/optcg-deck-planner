// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { CardStack } from "./CardStack";

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

function render(count: number, reserve = false) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <CardStack count={count} reserve={reserve} copy={<img alt="" src="x.jpg" />}>
        <button type="button">front</button>
      </CardStack>,
    ),
  );
  return host.querySelector(".card-stack")!;
}

describe("CardStack (#1272)", () => {
  it("draws one layer behind the front card per extra copy, capped at four cards (#1272)", () => {
    const cases: Array<[number, number]> = [[0, 0], [1, 0], [2, 1], [4, 3], [6, 3]];
    for (const [count, layers] of cases) {
      const stack = render(count);
      expect(stack.querySelectorAll(".card-stack-copy"), `${count} cards`).toHaveLength(layers);
      expect(stack.querySelectorAll(".card-stack-copy[aria-hidden='true'] img")).toHaveLength(layers);
      expect(stack.querySelector(".card-stack-front button")?.textContent).toBe("front");
      act(() => root!.unmount());
      host!.remove();
    }
  });

  it("layers are numbered from the one next to the front card outward, and reserve is opt-in (#1272)", () => {
    const stack = render(3, true);
    const layers = [...stack.querySelectorAll<HTMLElement>(".card-stack-copy")].map((l) => l.style.getPropertyValue("--layer"));
    expect(layers).toEqual(["1", "2"]);
    expect(stack.getAttribute("data-reserve")).toBe("true");
    act(() => root!.unmount());
    host!.remove();
    expect(render(3).hasAttribute("data-reserve")).toBe(false);
  });
});
