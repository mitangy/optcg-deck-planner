// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SettledScopeProvider, useColumnOrder, useSettledOrder, type SettledScope } from "./useSettledOrder";

type Row = { id: string; n: number };

const h = { scope: null as SettledScope | null };
const getId = (r: Row) => r.id;

function List({ rows, resetKey, columnSort = false }: { rows: Row[]; resetKey: string; columnSort?: boolean }) {
  // Most to buy first; a row whose count drops to 0 stops passing the filter.
  const target = rows.filter((r) => r.n > 0).sort((a, b) => b.n - a.n);
  const held = useSettledOrder({ target, live: rows, getId, resetKey });
  h.scope = held.scope;
  const sorted = useColumnOrder(held.items, columnSort ? { key: "n", dir: "asc" } : null, (r) => r.n, getId, held.scope);
  return (
    <SettledScopeProvider scope={held.scope}>
      <div data-testid="list">
        {sorted.map((r) => (
          <div key={r.id} data-row-id={r.id}>
            {r.id}
            {r.id === "a" ? <input className="owned" aria-label="owned a" readOnly /> : <button type="button">{r.id}</button>}
          </div>
        ))}
      </div>
      {held.liveRegion}
    </SettledScopeProvider>
  );
}

let root: Root;
let host: HTMLElement;
const render = (rows: Row[], resetKey = "k", columnSort = false) =>
  act(() => root.render(<List rows={rows} resetKey={resetKey} columnSort={columnSort} />));
const shown = () => [...host.querySelectorAll("[data-row-id]")].map((e) => (e as HTMLElement).dataset.rowId);
const row = (id: string) => host.querySelector(`[data-row-id="${id}"]`)!;
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const fire = (el: Element, type: string, init: Record<string, unknown> = {}) =>
  act(() => void el.dispatchEvent(Object.assign(new Event(type, { bubbles: true }), init)));
const away = (el: Element) => fire(el, "pointerout", { relatedTarget: document.body });

const three = (a: number): Row[] => [
  { id: "a", n: a },
  { id: "b", n: 2 },
  { id: "c", n: 1 },
];

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
});
beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe("lists that hold still while you edit a row (#1498)", () => {
  it("a covered row stays in the list and in place until the pointer has left it for 600 ms (#1498)", () => {
    render(three(3));
    expect(shown()).toEqual(["a", "b", "c"]);
    fire(row("a"), "pointerover");
    act(() => h.scope!.markEdited("a"));
    render(three(0));
    expect(shown()).toEqual(["a", "b", "c"]);
    advance(7000);
    expect(shown()).toEqual(["a", "b", "c"]);
    away(row("a"));
    advance(500);
    expect(shown()).toEqual(["a", "b", "c"]);
    advance(200);
    expect(shown()).toEqual(["b", "c"]);
  });

  it("a held row keeps its place when a count sort would move it, then glides to the live order (#1498)", () => {
    render(three(3));
    act(() => h.scope!.markEdited("a"));
    render(three(1.5));
    expect(shown()).toEqual(["a", "b", "c"]);
    advance(700);
    expect(shown()).toEqual(["b", "a", "c"]);
  });

  it("any change to the sort or filters settles at once, with the holds cleared (#1498)", () => {
    render(three(3), "sort-1");
    fire(row("a"), "pointerover");
    act(() => h.scope!.markEdited("a"));
    render(three(0), "sort-1");
    expect(shown()).toEqual(["a", "b", "c"]);
    render(three(0), "sort-2");
    expect(shown()).toEqual(["b", "c"]);
  });

  it("a row whose Owned input has focus is never released (#1498)", () => {
    render(three(3));
    act(() => h.scope!.markEdited("a"));
    act(() => (host.querySelector("input.owned") as HTMLInputElement).focus());
    render(three(0));
    advance(60_000);
    expect(shown()).toEqual(["a", "b", "c"]);
    act(() => (host.querySelector("input.owned") as HTMLInputElement).blur());
    advance(700);
    expect(shown()).toEqual(["b", "c"]);
  });

  it("keyboard focus inside the row holds it until focus leaves plus 600 ms (#1498)", () => {
    render(three(3));
    act(() => h.scope!.markEdited("a"));
    act(() => (row("a").querySelector("input") as HTMLInputElement).focus());
    render(three(0));
    advance(5000);
    expect(shown()).toEqual(["a", "b", "c"]);
    act(() => (row("a").querySelector("input") as HTMLInputElement).blur());
    advance(500);
    expect(shown()).toEqual(["a", "b", "c"]);
    advance(200);
    expect(shown()).toEqual(["b", "c"]);
  });

  it("a touch edit settles 2.5 s after the last tap, not at pointerleave (#1498)", () => {
    render(three(3));
    fire(row("a"), "pointerdown", { pointerType: "touch" });
    act(() => h.scope!.markEdited("a"));
    render(three(0));
    away(row("a"));
    advance(2400);
    expect(shown()).toEqual(["a", "b", "c"]);
    advance(200);
    expect(shown()).toEqual(["b", "c"]);
  });

  it("a touch tap on another row settles the list at once (#1498)", () => {
    render(three(3));
    fire(row("a"), "pointerdown", { pointerType: "touch" });
    act(() => h.scope!.markEdited("a"));
    render(three(0));
    fire(row("b"), "pointerdown", { pointerType: "touch" });
    expect(shown()).toEqual(["b", "c"]);
  });

  it("scrolling a touch hold by more than half a row settles it (#1498)", () => {
    render(three(3));
    fire(row("a"), "pointerdown", { pointerType: "touch" });
    act(() => h.scope!.markEdited("a"));
    render(three(0));
    Object.defineProperty(window, "scrollY", { value: 400, configurable: true });
    fire(window as unknown as Element, "scroll");
    expect(shown()).toEqual(["b", "c"]);
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  });

  it("the backstop lets go 8 s after the last interaction even with the pointer still on the row (#1498)", () => {
    render(three(3));
    fire(row("a"), "pointerover");
    act(() => h.scope!.markEdited("a"));
    render(three(0));
    advance(7900);
    expect(shown()).toEqual(["a", "b", "c"]);
    advance(200);
    expect(shown()).toEqual(["b", "c"]);
  });

  it("bulk changes hold their rows, then settle about 1.2 s later (#1498)", () => {
    render(three(3));
    act(() => h.scope!.markBulk([{ id: "a" }]));
    render(three(0));
    advance(1100);
    expect(shown()).toEqual(["a", "b", "c"]);
    advance(200);
    expect(shown()).toEqual(["b", "c"]);
  });

  it("all held rows settle together, when the last one lets go (#1498)", () => {
    render([{ id: "a", n: 3 }, { id: "b", n: 2 }, { id: "c", n: 1 }]);
    fire(row("a"), "pointerover");
    act(() => h.scope!.markEdited("a"));
    fire(row("b"), "pointerover");
    act(() => h.scope!.markEdited("b"));
    render([{ id: "a", n: 0 }, { id: "b", n: 0 }, { id: "c", n: 1 }]);
    // "a" was let go of long ago, but "b" is still under the pointer, so neither moves yet.
    advance(2000);
    expect(shown()).toEqual(["a", "b", "c"]);
    away(row("b"));
    advance(700);
    expect(shown()).toEqual(["c"]);
  });

  it("a failed save drops the hold, so the row follows the live order again (#1498)", () => {
    render(three(3));
    fire(row("a"), "pointerover");
    act(() => h.scope!.markEdited("a"));
    render(three(1.5));
    expect(shown()).toEqual(["a", "b", "c"]);
    act(() => h.scope!.clearHold("a"));
    expect(shown()).toEqual(["b", "a", "c"]);
  });

  it("only rows on this list are held, not a card edited elsewhere (#1498)", () => {
    render(three(3));
    act(() => h.scope!.markEdited("zz"));
    expect(h.scope!.row("zz")).toBeNull();
  });

  it("a row held in a column-sorted table keeps its place there too (#1498)", () => {
    render(three(3), "k", true);
    expect(shown()).toEqual(["c", "b", "a"]);
    fire(row("a"), "pointerover");
    act(() => h.scope!.markEdited("a"));
    render(three(1.5), "k", true);
    expect(shown()).toEqual(["c", "b", "a"]);
    render(three(0.5), "k", true);
    expect(shown()).toEqual(["c", "b", "a"]);
    away(row("a"));
    advance(700);
    expect(shown()).toEqual(["a", "c", "b"]);
  });

  it("reports a covered row as done only while it is held and fails the filter (#1498)", () => {
    render(three(3));
    fire(row("a"), "pointerover");
    act(() => h.scope!.markEdited("a", { key: "owned", restore: () => undefined }));
    expect(h.scope!.row("a")).toMatchObject({ done: false, canUndo: true });
    render(three(0));
    expect(h.scope!.row("a")).toMatchObject({ done: true, canUndo: true });
    expect(h.scope!.row("b")).toBeNull();
  });
});
