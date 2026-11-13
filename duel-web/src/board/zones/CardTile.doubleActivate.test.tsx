// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CardTile } from "./CardTile";

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
});

function mount(props: Parameters<typeof CardTile>[0]) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<CardTile {...props} />));
  return host.querySelector<HTMLElement>(".card-tile")!;
}
const fire = (el: Element, type: "click" | "dblclick") => act(() => void el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true })));
const inspectOpen = () => document.querySelector(".card-inspect-backdrop") != null;

describe("CardTile onDoubleActivate (#1287)", () => {
  it("a double click calls it once, skips the single click and does not open inspect (#1287)", () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    const onDoubleActivate = vi.fn();
    const tile = mount({ defId: "ST01-004", onClick, onDoubleActivate });
    fire(tile, "click");
    fire(tile, "click");
    fire(tile, "dblclick");
    act(() => void vi.advanceTimersByTime(500));
    expect(onDoubleActivate).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
    expect(inspectOpen()).toBe(false);
  });

  it("two quick taps with no dblclick event (iOS) call it once and skip the single click (#1287)", () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    const onDoubleActivate = vi.fn();
    const tile = mount({ defId: "ST01-004", onClick, onDoubleActivate });
    fire(tile, "click");
    fire(tile, "click");
    act(() => void vi.advanceTimersByTime(500));
    expect(onDoubleActivate).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("an instant-click tile has already toggled on the first click, and the second calls it once (#1287)", () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    const onDoubleActivate = vi.fn();
    const tile = mount({ defId: "ST01-004", onClick, onDoubleActivate, instantClick: true });
    fire(tile, "click");
    expect(onClick).toHaveBeenCalledTimes(1);
    fire(tile, "click");
    expect(onDoubleActivate).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("two clicks further apart than the double-click window are two single clicks (#1287)", () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    const onDoubleActivate = vi.fn();
    const tile = mount({ defId: "ST01-004", onClick, onDoubleActivate });
    fire(tile, "click");
    act(() => void vi.advanceTimersByTime(400));
    fire(tile, "click");
    act(() => void vi.advanceTimersByTime(400));
    expect(onClick).toHaveBeenCalledTimes(2);
    expect(onDoubleActivate).not.toHaveBeenCalled();
  });

  it("a third quick click starts over instead of calling it again (#1287)", () => {
    vi.useFakeTimers();
    const onDoubleActivate = vi.fn();
    const tile = mount({ defId: "ST01-004", onClick: () => {}, onDoubleActivate, instantClick: true });
    fire(tile, "click");
    fire(tile, "click");
    fire(tile, "click");
    expect(onDoubleActivate).toHaveBeenCalledTimes(1);
  });

  it("without it a double-click still opens inspect (#1287)", () => {
    const tile = mount({ defId: "ST01-004", onClick: () => {} });
    fire(tile, "dblclick");
    expect(inspectOpen()).toBe(true);
  });
});
