// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { OwnerTabs, type OwnerView } from "./OwnerTabs";

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

/** Keeps the view the way LogPosePanel does. */
function Harness({ start, waiting }: { start: OwnerView; waiting: number }) {
  const [view, setView] = useState<OwnerView>(start);
  return (
    <>
      <OwnerTabs view={view} waiting={waiting} onView={setView} />
      <output id="view">{view}</output>
    </>
  );
}

const tabs = () => [...document.querySelectorAll<HTMLElement>('[role="tab"]')];
const selected = () => tabs().filter((t) => t.getAttribute("aria-selected") === "true").map((t) => t.textContent);
const view = () => document.getElementById("view")!.textContent;

async function mount(start: OwnerView, waiting = 0) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<Harness start={start} waiting={waiting} />));
}

async function key(k: string) {
  await act(async () => {
    document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 20));
  });
}

describe("OwnerTabs", () => {
  it("marks the tab of the caller's view and reports a click on the other one (#719)", async () => {
    await mount("usage");
    expect(selected()).toEqual(["Usage"]);
    await act(async () => tabs()[0]!.click());
    expect(view()).toBe("requests");
    expect(selected()).toEqual(["Requests"]);
  });

  it("arrow keys switch between Requests and Usage and report the new view (#719)", async () => {
    await mount("requests");
    tabs()[0]!.focus();
    await key("ArrowRight");
    expect(view()).toBe("usage");
    expect(document.activeElement).toBe(tabs()[1]);
    await key("Home");
    expect(view()).toBe("requests");
  });

  it("shows the waiting count on Requests, capped at 99+ (#719)", async () => {
    await mount("requests", 120);
    expect(tabs()[0]!.querySelector(".lp-count")?.textContent).toBe("99+");
    expect(tabs()[1]!.querySelector(".lp-count")).toBeNull();
  });
});
