// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Select, type SelectOption } from "./Select";

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(HTMLElement.prototype, "innerText", {
    configurable: true,
    get() {
      return (this as HTMLElement).textContent;
    },
  });
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
});

const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const btn = () => document.getElementById("sel") as HTMLButtonElement;
const rows = () => [...document.querySelectorAll<HTMLElement>('[role="option"]')];

async function mount(ui: React.ReactElement) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(ui));
}

async function open() {
  await act(async () => {
    btn().click();
    await wait();
  });
}

async function pick(row: HTMLElement) {
  await act(async () => {
    row.click();
    await wait();
  });
}

const DAYS: SelectOption<number>[] = [
  { value: 7, label: "Last 7 days" },
  { value: 14, label: "Last 14 days" },
  { value: 30, label: "Last 30 days", disabled: true },
];

function DaysHarness({ onChange }: { onChange: (v: number) => void }) {
  const [v, setV] = useState(7);
  return (
    <Select
      id="sel"
      aria-label="Window"
      value={v}
      options={DAYS}
      onChange={(n) => {
        onChange(n);
        setV(n);
      }}
    />
  );
}

describe("Select", () => {
  it("picking an option passes its typed value, a number stays a number, and the button shows its label (#797)", async () => {
    const onChange = vi.fn();
    await mount(<DaysHarness onChange={onChange} />);
    expect(btn().textContent).toContain("Last 7 days");
    await open();
    await pick(rows()[1]!);
    expect(onChange).toHaveBeenCalledWith(14);
    expect(typeof onChange.mock.calls[0]![0]).toBe("number");
    expect(btn().textContent).toContain("Last 14 days");
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });

  it("a disabled option cannot be picked (#797)", async () => {
    const onChange = vi.fn();
    await mount(<DaysHarness onChange={onChange} />);
    await open();
    await pick(rows()[2]!);
    expect(onChange).not.toHaveBeenCalled();
    expect(btn().textContent).toContain("Last 7 days");
  });

  it("a disabled select does not open (#797)", async () => {
    await mount(<Select id="sel" aria-label="Window" value={7} options={DAYS} onChange={() => {}} disabled />);
    await open();
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });

  it("the button shows buttonLabel instead of a rich label, and the list marks only the chosen row (#797)", async () => {
    const options: SelectOption<string>[] = [
      { value: "a", label: "Alpha deck", sub: "Zoro · 50 cards", buttonLabel: "Alpha" },
      { value: "b", label: "Bravo deck", sub: "Luffy · 48 cards" },
    ];
    await mount(<Select id="sel" aria-label="Deck" value="a" options={options} onChange={() => {}} />);
    expect(btn().textContent).toBe("Alpha▾");
    await open();
    expect(rows().map((r) => r.textContent)).toEqual(["Alpha deckZoro · 50 cards✓", "Bravo deckLuffy · 48 cards"]);
  });

  it("a visible label names the button and the button keeps its id (#797)", async () => {
    await mount(<Select id="sel" label="Deck for the rematch" value="a" options={[{ value: "a", label: "Alpha" }]} onChange={() => {}} />);
    const names = btn().getAttribute("aria-labelledby")!.split(" ").map((i) => document.getElementById(i)?.textContent);
    expect(names).toContain("Deck for the rematch");
  });
});
