import { describe, expect, it } from "vitest";
import { hotseatGuestId } from "./api";

describe("hotseatGuestId", () => {
  it("appends seat suffix and stays within API guest_id bounds", () => {
    const a = hotseatGuestId("browserguestid001", "a");
    const b = hotseatGuestId("browserguestid001", "b");
    expect(a).toBe("browserguestid001-a");
    expect(b).toBe("browserguestid001-b");
    expect(a).toMatch(/^[a-zA-Z0-9_-]{8,64}$/);
    expect(b).toMatch(/^[a-zA-Z0-9_-]{8,64}$/);
  });

  it("pads short keys so the API accepts them", () => {
    const id = hotseatGuestId("ab", "a");
    expect(id.length).toBeGreaterThanOrEqual(8);
    expect(id).toMatch(/^[a-zA-Z0-9_-]{8,64}$/);
  });

  it("strips illegal characters", () => {
    const id = hotseatGuestId("user@host!", "a");
    expect(id).toMatch(/^[a-zA-Z0-9_-]{8,64}$/);
    expect(id.endsWith("-a")).toBe(true);
  });
});
