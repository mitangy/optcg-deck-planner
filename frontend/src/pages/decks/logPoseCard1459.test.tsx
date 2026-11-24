// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { useLogPoseCardLightbox } from "./logPoseCard";
import { PLANNER_SOURCE_HOOKS } from "./logPose";

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
      <button type="button" id="go" onClick={() => openCard("ST01-001")}>
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

  it("gives Log Pose card lists and deck edits the card's art, and nothing for an unknown id (#1459)", () => {
    expect(PLANNER_SOURCE_HOOKS.card?.("ST01-001")?.imageUrl).toMatch(/^https:\/\/tcgplayer-cdn\.tcgplayer\.com\/product\/\d+_400w\.jpg$/);
    expect(PLANNER_SOURCE_HOOKS.card?.("st01-001")?.imageUrl).toBe(PLANNER_SOURCE_HOOKS.card?.("ST01-001")?.imageUrl);
    expect(PLANNER_SOURCE_HOOKS.card?.("ZZ99-999")).toBeNull();
  });

  it("the enlarged card shows that card's art (#1459)", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root!.render(<Harness />));
    await act(async () => host!.querySelector<HTMLButtonElement>("#go")!.click());
    const img = document.querySelector<HTMLImageElement>(".lightbox-img");
    expect(img?.getAttribute("src")).toContain(`/product/${PLANNER_SOURCE_HOOKS.card!("ST01-001")!.imageUrl!.match(/product\/(\d+)/)![1]}_in_1000x1000`);
  });
});
