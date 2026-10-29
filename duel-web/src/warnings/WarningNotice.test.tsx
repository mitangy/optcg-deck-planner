// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { WarningNotice } from "./WarningNotice";
import type { PlayerWarning } from "./warningsApi";

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

const wait = () => new Promise((r) => setTimeout(r, 30));
const warnings: PlayerWarning[] = [
  { id: 4, message: "Please keep chat clean.", created_at: "2026-10-28T10:00:00Z" },
  { id: 5, message: "Your playmat broke the rules.", created_at: "2026-10-29T10:00:00Z" },
];

async function render(signedIn: boolean, acked: number[], load: () => Promise<PlayerWarning[]> = async () => warnings) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <MemoryRouter>
        <WarningNotice signedIn={signedIn} load={load} ack={async (id) => void acked.push(id)} />
      </MemoryRouter>,
    );
    await wait();
  });
}

const message = () => document.querySelector(".warning-message")?.textContent ?? null;
async function understand() {
  const btn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent === "I understand")!;
  await act(async () => {
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) btn.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
    await wait();
  });
}

describe("moderator warning notice (#810)", () => {
  it("shows one warning at a time, oldest first, and acknowledges each as it is understood (#810)", async () => {
    const acked: number[] = [];
    await render(true, acked);
    expect(document.querySelector("h2")!.textContent).toBe("A moderator sent you a warning");
    expect(message()).toBe("Please keep chat clean.");
    await understand();
    expect(acked).toEqual([4]);
    expect(message()).toBe("Your playmat broke the rules.");
    await understand();
    expect(acked).toEqual([4, 5]);
    expect(message()).toBeNull();
  });

  it("asks nothing of a player who is not signed in (#810)", async () => {
    let loaded = false;
    await render(false, [], async () => {
      loaded = true;
      return warnings;
    });
    expect(loaded).toBe(false);
    expect(message()).toBeNull();
  });
});
