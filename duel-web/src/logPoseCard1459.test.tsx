// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { useLogPoseCardInspect } from "./logPoseCard";
import { lookupCard } from "./cards/atlas";

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

function Harness() {
  const { openCard, inspect } = useLogPoseCardInspect();
  return (
    <>
      <button type="button" id="go" onClick={() => openCard("ST01-001")}>
        open
      </button>
      {inspect}
    </>
  );
}

describe("Log Pose card art in the duel app (#1459)", () => {
  it("opens the duel card preview for that card and closes it (#1459)", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await import("./board/preview/CardInspect");
    await act(async () => root!.render(<Harness />));
    expect(document.querySelector(".card-inspect-backdrop")).toBeNull();
    await act(async () => host!.querySelector<HTMLButtonElement>("#go")!.click());
    await act(async () => undefined);
    const open = document.querySelector(".card-inspect-backdrop");
    expect(open).not.toBeNull();
    expect(open!.textContent).toContain(lookupCard("ST01-001").name);
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.querySelector(".card-inspect-backdrop")).toBeNull();
  });
});
