// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { DuelEvent } from "../../events/eventApi";
import { QueueWait } from "./QueueWait";

const fetchCurrentEvent = vi.hoisted(() => vi.fn());
vi.mock("../../events/eventApi", () => ({ fetchCurrentEvent }));

let root: Root | null = null;
let host: HTMLElement | null = null;
const T0 = Date.parse("2026-12-01T12:00:00Z");

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  fetchCurrentEvent.mockResolvedValue(null);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
  fetchCurrentEvent.mockReset();
});

async function mount(info: { casual: boolean; playBot?: () => void }, onCancel = () => undefined): Promise<HTMLElement> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<QueueWait info={{ startedAt: T0, ...info }} onCancel={onCancel} />);
  });
  return host;
}

const tick = (seconds: number) => act(async () => void (await vi.advanceTimersByTimeAsync(seconds * 1000)));
const botButton = () => [...document.body.querySelectorAll("button")].find((b) => /Hard bot/.test(b.textContent ?? ""));

describe("casual queue wait (#1506)", () => {
  it("offers the Hard bot only once the search has run 45 seconds (#1506)", async () => {
    const playBot = vi.fn();
    await mount({ casual: true, playBot });
    expect(botButton()).toBeUndefined();
    await tick(44);
    expect(botButton()).toBeUndefined();
    await tick(1);
    const btn = botButton();
    expect(btn?.textContent).toBe("Play a Hard bot instead");
    act(() => btn!.click());
    expect(playBot).toHaveBeenCalledTimes(1);
  });

  it("counts from the start of the search, so a remounted board keeps the time (#1506)", async () => {
    vi.setSystemTime(T0 + 50_000);
    await mount({ casual: true, playBot: () => undefined });
    expect(botButton()).toBeDefined();
    expect(host!.querySelector(".queue-wait-time")?.textContent).toBe("0:50");
  });

  it("never offers a bot in a ranked search (#1506)", async () => {
    await mount({ casual: false });
    await tick(120);
    expect(botButton()).toBeUndefined();
  });

  it("shows the elapsed time and a Cancel that leaves (#1506)", async () => {
    const onCancel = vi.fn();
    await mount({ casual: true, playBot: () => undefined }, onCancel);
    await tick(75);
    expect(host!.querySelector(".queue-wait-time")?.textContent).toBe("1:15");
    const cancel = [...host!.querySelectorAll("button")].find((b) => b.textContent === "Cancel")!;
    act(() => cancel.click());
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("names the next game night when one is coming, and says nothing when none is (#1506)", async () => {
    const upcoming = {
      title: "Game night",
      starts_at: new Date(T0 + 3 * 86_400_000).toISOString(),
      ends_at: new Date(T0 + 3 * 86_400_000 + 7_200_000).toISOString(),
      status: "upcoming",
    } as DuelEvent;
    fetchCurrentEvent.mockResolvedValue(upcoming);
    await mount({ casual: true, playBot: () => undefined });
    expect(host!.querySelector(".queue-wait-event")?.textContent).toMatch(/^Next game night: /);
    act(() => root?.unmount());
    host?.remove();
    fetchCurrentEvent.mockResolvedValue(null);
    await mount({ casual: true, playBot: () => undefined });
    expect(host!.querySelector(".queue-wait-event")?.textContent).toBe("");
  });
});
