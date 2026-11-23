// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { updateSettings } from "../../settings";
import { LobbyTopbar } from "./LobbyTopbar";

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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
  updateSettings({ profileCard: "", profileArt: "" });
});

function render() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<MemoryRouter><LobbyTopbar authMode="google" accountName="Nami" bounty={1200} /></MemoryRouter>));
  return host.querySelector<HTMLAnchorElement>(".account-chip")!;
}

describe("account chip", () => {
  it("opens the profile, not settings, and names it (#1383)", () => {
    const chip = render();
    expect(chip.getAttribute("href")).toBe("/profile");
    expect(chip.getAttribute("aria-label")).toBe("Your profile: Nami");
    expect(chip.title).toBe("Your profile");
  });

  it("shows the chosen picture in place of the status dot (#1383)", () => {
    expect(render().querySelector(".account-dot")).not.toBeNull();
    act(() => root!.unmount());
    host!.remove();
    updateSettings({ profileCard: "OP01-001" });
    const chip = render();
    expect(chip.querySelector(".profile-avatar")).not.toBeNull();
    expect(chip.querySelector(".account-dot")).toBeNull();
  });

  it("shows the chosen alt art, not the base, when the picture has one (#1406)", () => {
    updateSettings({ profileCard: "EB01-021", profileArt: "" });
    const base = render().querySelector("img")!.getAttribute("src");
    act(() => root!.unmount());
    host!.remove();
    updateSettings({ profileArt: "p2" });
    const alt = render().querySelector("img")!.getAttribute("src");
    expect(alt).not.toBe(base);
  });
});
