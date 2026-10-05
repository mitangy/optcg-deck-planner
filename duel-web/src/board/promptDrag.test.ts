import { describe, expect, it } from "vitest";
import { clampPromptOffset } from "./promptDrag";

const view = { width: 1000, height: 800 };
// A 400x200 prompt sitting at the bottom centre.
const base = { left: 300, right: 700, top: 580, bottom: 780 };

describe("clampPromptOffset (dragging a prompt, #324)", () => {
  it("moves the prompt by the drag inside the screen (#324)", () => {
    expect(clampPromptOffset(base, { x: -120, y: -300 }, view)).toEqual({ x: -120, y: -300 });
  });

  it("stops the prompt at the screen edges (#324)", () => {
    expect(clampPromptOffset(base, { x: -900, y: -900 }, view)).toEqual({ x: -292, y: -572 });
    expect(clampPromptOffset(base, { x: 900, y: 900 }, view)).toEqual({ x: 292, y: 12 });
  });

  it("keeps the top-left of a prompt bigger than the screen on screen (#324)", () => {
    const tall = { left: 300, right: 700, top: 0, bottom: 1200 };
    expect(clampPromptOffset(tall, { x: 0, y: 500 }, view)).toEqual({ x: 0, y: 8 });
  });
});
