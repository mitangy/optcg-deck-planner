import { describe, expect, it, vi } from "vitest";
import type { ChoiceOptionView } from "../net/protocol";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
const { boardTargetOption } = await import("./ChoicePrompt");

const options: ChoiceOptionView[] = [
  { id: "o0", defId: "ST01-003", zone: "character", ownerSeat: 1, instanceId: "c-legal", eligible: true },
  { id: "o1", defId: "ST01-006", zone: "character", ownerSeat: 1, instanceId: "c-illegal", eligible: false },
];

describe("picking a prompt target on the board", () => {
  it("maps a clicked board card to its option", () => {
    expect(boardTargetOption(options, "c-legal")).toBe("o0");
  });

  it("ignores board cards the effect can't target", () => {
    expect(boardTargetOption(options, "c-illegal")).toBeNull();
  });
});
