// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PlayActions } from "./PlayActions";

let root: Root | null = null;
let host: HTMLElement | null = null;
const onPlay = vi.fn();

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // The anchored list measures itself with this; jsdom has none.
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
  onPlay.mockClear();
});

async function mount(disabled = false): Promise<HTMLElement> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<PlayActions disabled={disabled} onPlay={onPlay} />);
  });
  return host;
}

const buttons = () => [...document.body.querySelectorAll<HTMLElement>("button, [role=menuitem]")];
const named = (re: RegExp) => buttons().filter((b) => re.test(b.textContent ?? ""));

async function openMore() {
  const more = named(/^More ways to play/)[0]!;
  await act(async () => more.click());
  return more;
}

describe("home play buttons (#1506)", () => {
  it("has one big Play now button, and Play now starts a casual game (#1506)", async () => {
    await mount();
    const play = host!.querySelector<HTMLButtonElement>(".btn-play")!;
    expect(play.textContent).toMatch(/^Play now/);
    act(() => play.click());
    expect(onPlay).toHaveBeenCalledWith("casual");
  });

  it("keeps Ranked, Practice and Spectate out of sight until More is opened (#1506)", async () => {
    await mount();
    expect(named(/^(Ranked|Practice|Spectate)/)).toHaveLength(0);
    const more = await openMore();
    expect(more.getAttribute("aria-expanded")).toBe("true");
    expect(named(/^(Ranked|Practice|Spectate)/)).toHaveLength(3);
  });

  it("has exactly one Play vs Bot path, inside More, and it starts the bot setup (#1506)", async () => {
    await mount();
    expect(named(/Play vs Bot/)).toHaveLength(0);
    await openMore();
    const bot = named(/^Play vs Bot/);
    expect(bot).toHaveLength(1);
    await act(async () => bot[0]!.click());
    expect(onPlay).toHaveBeenCalledWith("bot");
  });

  it("floats the opened menu outside the home column, so no button around it moves (#1506)", async () => {
    await mount();
    await openMore();
    const menu = document.body.querySelector("[role=menu]");
    expect(menu).not.toBeNull();
    expect(host!.contains(menu)).toBe(false);
  });

  it("offers Play a friend next to More, and picking Ranked asks for Ranked (#1506)", async () => {
    await mount();
    act(() => named(/^Play a friend/)[0]!.click());
    expect(onPlay).toHaveBeenLastCalledWith("create");
    await openMore();
    await act(async () => named(/^Ranked/)[0]!.click());
    expect(onPlay).toHaveBeenLastCalledWith("queue");
  });

  it("disables every way in while a game is starting (#1506)", async () => {
    await mount(true);
    expect(host!.querySelector<HTMLButtonElement>(".btn-play")!.disabled).toBe(true);
    expect(named(/^Play a friend/)[0]).toHaveProperty("disabled", true);
    expect(named(/^More ways to play/)[0]).toHaveProperty("disabled", true);
  });
});
