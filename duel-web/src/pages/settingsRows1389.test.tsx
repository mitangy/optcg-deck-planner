// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DonArtPicker } from "./DonArtPicker";
import { SettingToggle } from "./SettingToggle";

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

async function mount(el: React.ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(el);
  });
}

function Harness({ disabled = false }: { disabled?: boolean }) {
  const [on, setOn] = useState(false);
  return <SettingToggle checked={on} onChange={setOn} label="Sounds" hint="Plays a chime." disabled={disabled} />;
}

const box = () => host!.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
const hint = () => host!.querySelector<HTMLElement>(".switch-hint")!;

describe("settings toggle rows (#1389)", () => {
  it("tapping the hint text toggles the switch (#1389)", async () => {
    await mount(<Harness />);
    expect(box().checked).toBe(false);
    await act(async () => hint().click());
    expect(box().checked).toBe(true);
  });

  it("the hint describes the switch instead of being part of its name (#1389)", async () => {
    await mount(<Harness />);
    const name = document.getElementById(box().getAttribute("aria-labelledby")!)!;
    expect(name.textContent).toBe("Sounds");
    expect(document.getElementById(box().getAttribute("aria-describedby")!)!.textContent).toBe("Plays a chime.");
  });

  it("a disabled row ignores a tap on its hint (#1389)", async () => {
    await mount(<Harness disabled />);
    await act(async () => hint().click());
    expect(box().checked).toBe(false);
  });
});

describe("DON!! art dialog (#1389)", () => {
  async function openDialog(onChange: (id: number | null) => void) {
    await mount(<DonArtPicker value={null} onChange={onChange} savedWhere="" />);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    const open = [...host!.querySelectorAll("button")].find((b) => b.textContent === "Change DON!! art")!;
    await act(async () => open.click());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
  }

  it("the art grid lives in a dialog that opens from Change DON!! art (#1389)", async () => {
    await openDialog(vi.fn());
    expect(host!.querySelector(".don-art-tile")).toBeNull();
    expect(document.querySelector('[role="dialog"] .don-art-tile')).not.toBeNull();
  });

  it("picking an art applies it and closes the dialog (#1389)", async () => {
    const onChange = vi.fn();
    await openDialog(onChange);
    const tile = document.querySelector<HTMLButtonElement>('[role="dialog"] .don-art-tile')!;
    await act(async () => tile.click());
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(typeof onChange.mock.calls[0][0]).toBe("number");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
