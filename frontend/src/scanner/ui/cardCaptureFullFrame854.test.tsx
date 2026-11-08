// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CardCaptureLive } from "./CardCaptureLive";

vi.mock("../runtime/scanLog", async (orig) => ({ ...(await orig<typeof import("../runtime/scanLog")>()), scanLog: () => {} }));

let root: Root | null = null;
let host: HTMLElement | null = null;
const drawImage = vi.fn();
const canvases: HTMLCanvasElement[] = [];

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  drawImage.mockClear();
  canvases.length = 0;
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => {
        const track = { stop: vi.fn(), getCapabilities: () => ({}), getSettings: () => ({ width: 1920, height: 1080 }) };
        return { getTracks: () => [track], getVideoTracks: () => [track] };
      }),
    },
  });
  HTMLMediaElement.prototype.play = vi.fn(async () => {});
  HTMLCanvasElement.prototype.getContext = vi.fn(function (this: HTMLCanvasElement) {
    canvases.push(this);
    return { drawImage };
  }) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
    cb(new Blob(["x"], { type: "image/jpeg" }));
  };
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const wait = () => new Promise((r) => setTimeout(r, 40));

describe("CardCaptureLive full frame", () => {
  it("Capture sends the whole camera frame, not a cropped box (#854)", async () => {
    const onCapture = vi.fn();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(<CardCaptureLive onCapture={onCapture} onCancel={() => {}} />);
      await wait();
    });
    const video = document.querySelector<HTMLVideoElement>("video.live-video")!;
    Object.defineProperty(video, "videoWidth", { configurable: true, value: 1920 });
    Object.defineProperty(video, "videoHeight", { configurable: true, value: 1080 });
    const shutter = document.querySelector<HTMLButtonElement>('button[aria-label="Capture"]')!;
    await act(async () => {
      shutter.click();
      await wait();
    });
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 1920, 1080);
    expect(canvases[0].width).toBe(1920);
    expect(canvases[0].height).toBe(1080);
    expect(onCapture).toHaveBeenCalledTimes(1);
  });
});
