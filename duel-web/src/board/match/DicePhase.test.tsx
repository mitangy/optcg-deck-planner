// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { DiceStateMessage } from "../../net/protocol";
import { DICE_TUMBLE_MS, DicePhase } from "./DicePhase";

const state = (over: Partial<DiceStateMessage> = {}): DiceStateMessage => ({
  protocolVersion: 5,
  roller: 1,
  caller: 0,
  step: "call",
  call: null,
  roll: null,
  winner: null,
  deadline: null,
  seat: 0,
  role: "player",
  players: [{ name: "Luffy" }, { name: "Zoro" }],
  ...over,
});

let root: Root | null = null;
let host: HTMLElement | null = null;
const onAction = vi.fn();

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = host = null;
  onAction.mockClear();
  vi.useRealTimers();
});

function mount(s: DiceStateMessage) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const render = (next: DiceStateMessage) => act(() => root!.render(<DicePhase state={next} onAction={onAction} />));
  render(s);
  return { render, buttons: () => [...host!.querySelectorAll("button")], face: () => host!.querySelector(".dice-die")!.getAttribute("data-face") };
}

const label = (b: HTMLButtonElement) => b.textContent;

describe("DicePhase (#1190)", () => {
  it("lets the caller pick High or Low and sends that call", () => {
    const { buttons } = mount(state());
    expect(buttons().map(label)).toEqual(["High (4-6)", "Low (1-3)"]);
    act(() => buttons()[1]!.click());
    expect(onAction).toHaveBeenCalledWith({ action: "call", call: "low" });
  });

  it("gives the roller a Roll button that stays shut until the call is in", () => {
    const { buttons, render } = mount(state({ seat: 1 }));
    expect(buttons().map(label)).toEqual(["Roll"]);
    expect(buttons()[0]!.disabled).toBe(true);
    render(state({ seat: 1, step: "roll", call: "high" }));
    expect(buttons()[0]!.disabled).toBe(false);
    act(() => buttons()[0]!.click());
    expect(onAction).toHaveBeenCalledWith({ action: "roll" });
  });

  it("tumbles a die that arrives, then shows the roll and opens the winner's choice", () => {
    vi.useFakeTimers();
    // Tumble faces are random: pin them to 1 so the final face can only be 6 if the roll is drawn.
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    const { buttons, render, face } = mount(state({ step: "roll", call: "high" }));
    expect(face()).toBe("");
    render(state({ step: "choose", call: "high", roll: 6, winner: 0 }));
    expect(host!.querySelector(".dice-die")!.className).toContain("is-tumbling");
    expect(buttons().every((b) => b.disabled)).toBe(true);
    act(() => void vi.advanceTimersByTime(DICE_TUMBLE_MS + 10));
    random.mockRestore();
    expect(face()).toBe("6");
    expect(host!.querySelector(".dice-die")!.className).not.toContain("is-tumbling");
    expect(buttons().map(label)).toEqual(["Go first", "Go second"]);
    expect(buttons().every((b) => !b.disabled)).toBe(true);
    act(() => buttons()[1]!.click());
    expect(onAction).toHaveBeenCalledWith({ action: "second" });
  });

  it("shows a roll that was already there on arrival (a reconnect) without tumbling", () => {
    const { face } = mount(state({ step: "choose", call: "low", roll: 2, winner: 1 }));
    expect(face()).toBe("2");
    expect(host!.querySelector(".dice-die")!.className).not.toContain("is-tumbling");
  });

  it("shows a spectator both names and no buttons", () => {
    const { buttons } = mount(state({ role: "spectator", step: "roll", call: "high" }));
    expect(buttons()).toHaveLength(0);
    expect(host!.textContent).toContain("Luffy");
    expect(host!.textContent).toContain("Zoro");
    expect(host!.textContent).toContain("Zoro is rolling…");
  });

  it("counts down to the deadline", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    mount(state({ deadline: 1_000_000 + 12_000 }));
    expect(host!.querySelector(".dice-timer")!.textContent).toBe("12s left");
    act(() => void vi.advanceTimersByTime(5000));
    expect(host!.querySelector(".dice-timer")!.textContent).toBe("7s left");
  });
});
