// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { LivePanel } from "./LivePanel";

let root: Root | null = null;
let host: HTMLElement | null = null;
const handlers = { onInvite: vi.fn(), onBot: vi.fn(), onPractice: vi.fn() };

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.unstubAllGlobals();
  Object.values(handlers).forEach((h) => h.mockClear());
});

async function mount(counts: { online: number; matches: number }, disabled = false): Promise<HTMLElement> {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(counts))));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<LivePanel {...handlers} disabled={disabled} />);
  });
  return host;
}

const button = (el: HTMLElement, name: string) => [...el.querySelectorAll("button")].find((b) => b.textContent === name);

describe("Live panel (#930)", () => {
  it("offers Invite a friend, Play vs Bot and Practice when no match is being played (#930)", async () => {
    const el = await mount({ online: 0, matches: 0 });
    expect(el.querySelector('section[aria-label="No matches right now"]')).not.toBeNull();
    act(() => button(el, "Invite a friend")!.click());
    act(() => button(el, "Play vs Bot")!.click());
    act(() => button(el, "Practice")!.click());
    expect(handlers.onInvite).toHaveBeenCalledTimes(1);
    expect(handlers.onBot).toHaveBeenCalledTimes(1);
    expect(handlers.onPractice).toHaveBeenCalledTimes(1);
  });

  it("shows the match count and no invite card while matches are being played (#930)", async () => {
    const el = await mount({ online: 14, matches: 3 });
    expect(el.querySelector('[role="status"]')?.textContent).toBe("3 matches being played now · 14 online");
    expect(button(el, "Invite a friend")).toBeUndefined();
    expect(el.querySelector("section")).toBeNull();
  });

  it("disables the buttons while a game is starting (#930)", async () => {
    const el = await mount({ online: 0, matches: 0 }, true);
    expect(button(el, "Invite a friend")!.disabled).toBe(true);
    act(() => button(el, "Invite a friend")!.click());
    expect(handlers.onInvite).not.toHaveBeenCalled();
  });
});
