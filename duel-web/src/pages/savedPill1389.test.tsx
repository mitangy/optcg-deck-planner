// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { SavedPill } from "./SavedPill";
import { applyRemoteSettings, currentSettings, updateSettings } from "../settings";

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

function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<SavedPill signedIn={false} />));
}

describe("Settings Saved pill (#1389)", () => {
  it("shows Saved after the player changes a setting (#1389)", () => {
    mount();
    act(() => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      updateSettings({ battleArrow: !currentSettings().battleArrow });
    });
    expect(host!.textContent).toContain("Saved in this browser");
  });

  it("stays hidden when settings change with no input on the page, e.g. account sync (#1389)", () => {
    mount();
    act(() => {
      applyRemoteSettings({ battleArrow: !currentSettings().battleArrow });
    });
    expect(host!.textContent).not.toContain("Saved");
  });
});
