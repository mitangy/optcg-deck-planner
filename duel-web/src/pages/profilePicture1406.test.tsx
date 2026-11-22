// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { currentSettings, updateSettings } from "../settings";
import { ProfilePage } from "./ProfilePage";

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  vi.stubGlobal("fetch", () => Promise.resolve(new Response("{}", { status: 404 })));
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = host = null;
  updateSettings({ profileCard: "", profileArt: "" });
  localStorage.clear();
});

async function render() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<MemoryRouter><ProfilePage /></MemoryRouter>);
  });
}
const byLabel = (label: string) => host!.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const byText = (text: string) => [...host!.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === text) ?? null;
const click = (el: Element) => act(async () => void el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })));

const WITH_ALTS = "Hannyabal (EB01-021)";
const WITH_ALTS_ID = "EB01-021";

describe("profile picture art step (#1406)", () => {
  it("picking a card with alt arts opens the art step, and an alt is saved (#1406)", async () => {
    await render();
    await click(byLabel(WITH_ALTS));
    expect(currentSettings().profileCard).toBe(WITH_ALTS_ID);
    expect(host!.textContent).toContain(`Choose art for ${WITH_ALTS}`);
    expect(byLabel("Base").getAttribute("aria-pressed")).toBe("true");
    await click(byLabel("Special Art"));
    expect(currentSettings().profileArt).toBe("p2");
    expect(byLabel("Special Art").getAttribute("aria-pressed")).toBe("true");
    expect(host!.querySelector("[role=status]")!.textContent).toBe(`Using ${WITH_ALTS}, Special Art.`);
  });

  it("Back to cards returns to the grid and Change art reopens the art step (#1406)", async () => {
    await render();
    await click(byLabel(WITH_ALTS));
    await click(byText("Back to cards")!);
    expect(host!.textContent).not.toContain("Choose art for");
    expect(byLabel(WITH_ALTS)).not.toBeNull();
    await click(byText("Change art")!);
    expect(host!.textContent).toContain("Choose art for");
    expect(byText("Change art")).toBeNull();
  });

  it("picking a different card resets the art and Remove picture clears both (#1406)", async () => {
    await render();
    await click(byLabel(WITH_ALTS));
    await click(byLabel("Special Art"));
    await click(byText("Back to cards")!);
    await click(byLabel("Kyros (EB01-040)"));
    expect(currentSettings()).toMatchObject({ profileCard: "EB01-040", profileArt: "" });
    updateSettings({ profileArt: "p1" });
    await click(byText("Remove picture")!);
    expect(currentSettings()).toMatchObject({ profileCard: "", profileArt: "" });
  });

  it("a card without alt arts stays on the card grid (#1406)", async () => {
    await render();
    const input = host!.querySelector<HTMLInputElement>("#profile-card-search")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "P-076");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(host!.querySelector("button.profile-pick")!);
    expect(currentSettings().profileCard).toBe("P-076");
    expect(host!.textContent).not.toContain("Choose art for");
    expect(byText("Change art")).toBeNull();
  });
});
