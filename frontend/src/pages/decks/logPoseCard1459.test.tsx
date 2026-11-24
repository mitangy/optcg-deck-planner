// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { useLogPoseCardLightbox } from "./logPoseCard";

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
  const { openCard, lightbox } = useLogPoseCardLightbox();
  return (
    <>
      <button type="button" id="go" onClick={() => openCard("OP01-001")}>
        open
      </button>
      {lightbox}
    </>
  );
}

describe("Log Pose card art in the planner (#1459)", () => {
  it("opens the planner's expanded card for that card and closes it (#1459)", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root!.render(<Harness />));
    expect(document.querySelector(".lightbox")).toBeNull();
    await act(async () => host!.querySelector<HTMLButtonElement>("#go")!.click());
    expect(document.querySelector(".lightbox")).not.toBeNull();
    await act(async () => document.querySelector<HTMLButtonElement>(".lightbox-close")!.click());
    expect(document.querySelector(".lightbox")).toBeNull();
  });
});
