import { afterEach, describe, expect, it, vi } from "vitest";
import { clearPreviewCard, getLastHoverAt, getPreviewCard, setPreviewCard } from "./cardPreview";

describe("closing the card preview pop-up (#529)", () => {
  afterEach(() => {
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
