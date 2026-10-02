import { describe, expect, it } from "vitest";
import { ApiError } from "../net/api";
import { MissingTicketError, signInErrorMessage } from "./signInError";

describe("signInErrorMessage", () => {
  it("never shows the raw API error text (#262)", () => {
    const raw = "Claim failed (500): <html>Internal Server Error</html>";
    for (const e of [new ApiError(500, raw), new ApiError(410, raw), new Error(raw), new TypeError("Failed to fetch")]) {
      expect(signInErrorMessage(e)).not.toContain("Claim failed");
      expect(signInErrorMessage(e)).not.toContain("<html>");
    }
  });

  it("asks to sign in again for a used or expired link, and to retry on a server error (#262)", () => {
    expect(signInErrorMessage(new ApiError(410, "gone"))).toMatch(/expired or was already used/);
    expect(signInErrorMessage(new ApiError(503, "busy"))).toMatch(/try again in a moment/);
    expect(signInErrorMessage(new MissingTicketError())).toMatch(/incomplete/);
  });
});
