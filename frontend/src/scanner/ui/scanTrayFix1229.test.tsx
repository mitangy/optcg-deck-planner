// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ScanTray } from "./ScanTray";
import type { TrayRow } from "./scanTrayModel";

vi.mock("./ScanShare", () => ({ ScanShare: () => null }));

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

const row: TrayRow = { key: "r1", cardId: null, confidence: "none", fixed: false, thumbs: ["x.png"], sources: [0], qty: 0 };

describe("scan tray Fix form", () => {
  it("a Fix lookup that fails frees the Use button again (#1229)", async () => {
    const onFix = vi.fn(async () => {
      throw new Error("network down");
    });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(
        <ScanTray rows={[row]} found={1} cards={new Map()} adding={false} addError={null} onQty={() => {}} onFix={onFix} onAdd={() => {}} onRescan={() => {}} />,
      );
    });
    const input = host.querySelector<HTMLInputElement>("input[aria-label='Card number']")!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(input, "OP01-001");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const use = host.querySelector<HTMLButtonElement>("button[type='submit']")!;
    await act(async () => {
      use.form!.requestSubmit();
    });
    expect(onFix).toHaveBeenCalledTimes(1);
    expect(use.disabled).toBe(false);
  });
});
