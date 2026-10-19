import { describe, expect, it } from "vitest";
import { parseChatCommand } from "./chatCommand";

describe("parseChatCommand", () => {
  it("reads /ff, /surrender and /concede as concede, ignoring case and padding (#449)", () => {
    for (const t of ["/ff", "  /FF ", "/Surrender", "/concede\n"]) {
      expect(parseChatCommand(t)).toEqual({ kind: "concede" });
    }
  });

  it("leaves messages that merely contain or extend the command as chat (#449)", () => {
    for (const t of ["/ffx", "gg /ff", "/ff now", "ff", "/f f", ""]) {
      expect(parseChatCommand(t)).toBeNull();
    }
  });
});
