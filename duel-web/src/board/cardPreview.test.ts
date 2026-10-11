import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearPreviewCard,
  endPreviewHover,
  getLastHoverAt,
  getPreviewCard,
  getPreviewHovering,
  hoverPreviewCard,
  previewPopupLive,
  setAutoPreviewCard,
  setPreviewCard,
} from "./cardPreview";

describe("closing the card preview pop-up (#529)", () => {
  afterEach(() => {
    endPreviewHover();
    clearPreviewCard();
    vi.useRealTimers();
  });

  it("hovering the same card again reopens the preview after it was closed (#529)", () => {
    const card = { defId: "ST01-001", ownerSeat: 0 as const };
    setPreviewCard(card);
    expect(getPreviewCard()).toEqual(card);
    clearPreviewCard();
    expect(getPreviewCard()).toBeNull();
    setPreviewCard({ ...card });
    expect(getPreviewCard()).toEqual(card);
  });

  it("closing leaves the hover time alone so an auto preview is not held back (#529)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-11T12:00:00Z"));
    setPreviewCard({ defId: "ST01-001" });
    const hoveredAt = getLastHoverAt();
    vi.setSystemTime(new Date("2026-10-11T12:00:05Z"));
    clearPreviewCard();
    expect(getLastHoverAt()).toBe(hoveredAt);
  });
});

describe("the card preview pop-up is a hover pop-up (#529)", () => {
  afterEach(() => {
    endPreviewHover();
    clearPreviewCard();
  });

  it("a mouse over a card marks it hovered until the pointer leaves, and the card stays for the docked panel (#529)", () => {
    hoverPreviewCard({ defId: "ST01-001" });
    expect(getPreviewHovering()).toBe(true);
    endPreviewHover();
    expect(getPreviewHovering()).toBe(false);
    expect(getPreviewCard()).toEqual({ defId: "ST01-001" });
  });

  it("an auto preview, focus or a click does not count as hovering, so none opens the pop-up (#529)", () => {
    setAutoPreviewCard({ defId: "ST01-002", caption: "Opponent played" });
    expect(getPreviewHovering()).toBe(false);
    setPreviewCard({ defId: "ST01-003" });
    expect(getPreviewHovering()).toBe(false);
    expect(getPreviewCard()).toEqual({ defId: "ST01-003" });
  });

  it("is up while pinned, hovering, over the pop-up or dragging, and not otherwise (#529)", () => {
    const off = { pinned: false, hovering: false, overPopup: false, dragging: false };
    expect(previewPopupLive(off)).toBe(false);
    for (const key of ["pinned", "hovering", "overPopup", "dragging"] as const) {
      expect(previewPopupLive({ ...off, [key]: true }), key).toBe(true);
    }
  });
});
