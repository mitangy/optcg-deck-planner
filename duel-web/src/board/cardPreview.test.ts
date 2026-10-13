import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearPreviewCard,
  endPreviewHover,
  getHoverAnchor,
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

describe("the pop-up remembers which card was hovered so it can step aside (#583)", () => {
  const el = (left: number, top: number, right: number, bottom: number) =>
    ({ getBoundingClientRect: () => ({ left, top, right, bottom, width: right - left, height: bottom - top }) }) as unknown as Element;
  afterEach(() => {
    endPreviewHover();
    clearPreviewCard();
  });

  it("a hover records the card's box, the next hover replaces it, and leaving keeps it while the pop-up lingers (#583)", () => {
    hoverPreviewCard({ defId: "ST01-001" }, el(10, 20, 110, 160));
    expect(getHoverAnchor()).toEqual({ left: 10, top: 20, right: 110, bottom: 160 });
    endPreviewHover();
    expect(getHoverAnchor()).toEqual({ left: 10, top: 20, right: 110, bottom: 160 });
    hoverPreviewCard({ defId: "ST01-002" }, el(300, 40, 400, 180));
    expect(getHoverAnchor()).toEqual({ left: 300, top: 40, right: 400, bottom: 180 });
  });

  it("closing the preview forgets the box (#583)", () => {
    hoverPreviewCard({ defId: "ST01-001" }, el(10, 20, 110, 160));
    clearPreviewCard();
    expect(getHoverAnchor()).toBeNull();
  });
});
