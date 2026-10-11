import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });

import { clearPreviewCard, endPreviewHover, getPreviewCard, getPreviewHovering } from "./cardPreview";
import { ZonePile } from "./ZonePile";

/** Every element in a rendered tree whose className has `cls`. */
function findAll(node: ReactNode, cls: string, out: ReactElement<Record<string, unknown>>[] = []) {
  if (Array.isArray(node)) node.forEach((n) => findAll(n, cls, out));
  else if (isValidElement<Record<string, unknown>>(node)) {
    if (String(node.props.className ?? "").split(" ").includes(cls)) out.push(node);
    findAll(node.props.children as ReactNode, cls, out);
  }
  return out;
}

const life = (pointerType: string) => {
  // ZonePile has no hooks, so calling it returns its element tree.
  const tree = ZonePile({ label: "Life", count: 3, variant: "life", faceUp: [{ index: 0, defId: "OP16-108" }], ownerSeat: 1 });
  const faces = findAll(tree, "is-face-up");
  const hover = faces[0]?.props.onPointerEnter as ((e: { pointerType: string }) => void) | undefined;
  const leave = faces[0]?.props.onPointerLeave as ((e: { pointerType: string }) => void) | undefined;
  return { faces, enter: () => hover?.({ pointerType }), leave: () => leave?.({ pointerType }) };
};

describe("hovering a face-up Life card (#529)", () => {
  afterEach(() => {
    endPreviewHover();
    clearPreviewCard();
  });

  it("a mouse over the face-up Life card previews that card (#529)", () => {
    const { faces, enter } = life("mouse");
    expect(faces).toHaveLength(1);
    enter();
    expect(getPreviewCard()).toEqual({ defId: "OP16-108", ownerSeat: 1 });
  });

  it("the pointer leaving it ends the hover, so the pop-up can hide (#529)", () => {
    const { enter, leave } = life("mouse");
    enter();
    expect(getPreviewHovering()).toBe(true);
    leave();
    expect(getPreviewHovering()).toBe(false);
  });

  it("a finger touching it does not open the preview (#529)", () => {
    life("touch").enter();
    expect(getPreviewCard()).toBeNull();
  });
});
