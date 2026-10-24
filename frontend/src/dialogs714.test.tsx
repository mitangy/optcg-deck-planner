// @vitest-environment jsdom
import { act, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CardScanner } from "./CardScanner";

vi.mock("./scanLog", async (orig) => ({ ...(await orig<typeof import("./scanLog")>()), scanLog: () => {} }));
vi.mock("./useScanData", () => ({
  useScanData: () => ({ state: { kind: "ready", candidates: [], totalBytes: 0 }, download: () => {} }),
}));
vi.mock("./api", async (orig) => ({
  ...(await orig<typeof import("./api")>()),
  api: {
    searchCatalog: async () => [
      { card_id: "OP01-001", name: "Roronoa Zoro", group_name: "Romance Dawn", image_url: "https://tcgplayer-cdn.tcgplayer.com/product/1_200w.jpg", market_price: 1.5, tcgplayer_url: "https://example.test/zoro", product_id: 1 },
    ],
  },
}));

let root: Root | null = null;
let host: HTMLElement | null = null;
let tracks: Array<{ stop: ReturnType<typeof vi.fn> }> = [];

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  tracks = [];
  // jsdom has no camera: hand out a stream whose tracks record `stop()`.
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => {
        const track = { stop: vi.fn(), getCapabilities: () => ({}), getSettings: () => ({ width: 640, height: 480 }) };
        tracks.push(track);
        return { getTracks: () => [track], getVideoTracks: () => [track] };
      }),
    },
  });
  HTMLMediaElement.prototype.play = vi.fn(async () => {});
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const wait = () => new Promise((r) => setTimeout(r, 40));
const opener = () => document.getElementById("opener") as HTMLButtonElement;
const scanner = () => document.querySelector<HTMLElement>(".scan-backdrop");
const camera = () => document.querySelector<HTMLElement>(".live-capture-overlay");
const lightbox = () => document.querySelector<HTMLElement>(".lightbox");
const byText = (scope: ParentNode, text: string) =>
  Array.from(scope.querySelectorAll<HTMLElement>("button")).find((b) => b.textContent?.trim() === text)!;

async function press(key: string) {
  await act(async () => {
    (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    await wait();
  });
}

async function click(el: Element) {
  await act(async () => {
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
    }
    await wait();
  });
}

/** A page with an opener button that opens the scanner, so focus has somewhere to come back to. */
async function openScanner(onClose = vi.fn()) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  function Page() {
    const [open, setOpen] = useState(false);
    return (
      <QueryClientProvider client={new QueryClient()}>
        <button type="button" id="opener" onClick={() => setOpen(true)}>
          Scan
        </button>
        {open ? (
          <CardScanner
            items={[]}
            onClose={() => {
              onClose();
              setOpen(false);
            }}
          />
        ) : null}
      </QueryClientProvider>
    );
  }
  await act(async () => root!.render(<Page />));
  opener().focus();
  await click(opener());
  return onClose;
}

describe("CardScanner and the camera on the shared Dialog", () => {
  it("opens as a named modal with focus inside it (#714)", async () => {
    await openScanner();
    expect(scanner()!.getAttribute("role")).toBe("dialog");
    expect(scanner()!.getAttribute("aria-modal")).toBe("true");
    expect(scanner()!.getAttribute("aria-label")).toBe("Scan a card");
    expect(scanner()!.contains(document.activeElement)).toBe(true);
  });

  it("Escape closes the scanner and focus returns to the button that opened it (#714)", async () => {
    const onClose = await openScanner();
    await press("Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(scanner()).toBeNull();
    expect(document.activeElement).toBe(opener());
  });

  it("Escape in the camera closes only the camera, and stops it; a second Escape closes the scanner (#714)", async () => {
    const onClose = await openScanner();
    await click(byText(scanner()!, "Scan with camera"));
    await act(async () => wait());
    expect(camera()).not.toBeNull();
    expect(tracks).toHaveLength(1);
    expect(tracks[0].stop).not.toHaveBeenCalled();

    await press("Escape");
    expect(camera()).toBeNull();
    expect(scanner()).not.toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(tracks[0].stop).toHaveBeenCalledTimes(1);

    await press("Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("the camera's Cancel button stops the stream and returns to the scanner (#714)", async () => {
    await openScanner();
    await click(byText(scanner()!, "Scan with camera"));
    await act(async () => wait());
    await click(byText(camera()!, "Cancel"));
    expect(camera()).toBeNull();
    expect(scanner()).not.toBeNull();
    expect(tracks[0].stop).toHaveBeenCalledTimes(1);
  });

  it("closing the scanner under a live camera stops the stream (#714)", async () => {
    await openScanner();
    await click(byText(scanner()!, "Scan with camera"));
    await act(async () => wait());
    act(() => root!.unmount());
    root = null;
    expect(tracks[0].stop).toHaveBeenCalledTimes(1);
    expect(camera()).toBeNull();
  });

  it("a tap on the camera picture does not close it (#714)", async () => {
    await openScanner();
    await click(byText(scanner()!, "Scan with camera"));
    await act(async () => wait());
    await click(camera()!);
    await click(camera()!.querySelector("video")!);
    expect(camera()).not.toBeNull();
    expect(tracks[0].stop).not.toHaveBeenCalled();
  });

  it("Escape inside a lightbox opened from the scanner closes only the lightbox (#714)", async () => {
    const onClose = await openScanner();
    const input = scanner()!.querySelector<HTMLInputElement>("#scan-manual-input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "op01-001");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await wait();
    });
    await act(async () => {
      scanner()!.querySelector<HTMLFormElement>("form.scan-manual")!.requestSubmit();
      await wait();
    });
    const thumb = scanner()!.querySelector<HTMLButtonElement>(".thumb-btn")!;
    thumb.focus();
    await click(thumb);
    expect(lightbox()).not.toBeNull();

    await press("Escape");
    expect(lightbox()).toBeNull();
    expect(scanner()).not.toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(scanner()!.querySelector(".thumb-btn"));
  });
});
