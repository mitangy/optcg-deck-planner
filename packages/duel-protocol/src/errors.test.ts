import { describe, expect, it } from "vitest";
import { ProtocolError, errorCodeOf, expectEnvelope } from "./errors";

describe("protocol errors (refactor 2.2)", () => {
  it("reports the code an error carries and falls back for anything the protocol does not define", () => {
    expect(errorCodeOf(new ProtocolError("no token", "unauthorized"), "bad_protocol")).toBe("unauthorized");
    expect(errorCodeOf(Object.assign(new Error("x"), { code: "unsupported_deck" }), "bad_protocol")).toBe("unsupported_deck");
    expect(errorCodeOf(Object.assign(new Error("x"), { code: "ENOENT" }), "bad_protocol")).toBe("bad_protocol");
    expect(errorCodeOf(new Error("plain"), "illegal_intent")).toBe("illegal_intent");
    expect(errorCodeOf(undefined, "unauthorized")).toBe("unauthorized");
  });

  it("refuses a message body that is not an object, or that speaks another protocol version", () => {
    expect(() => expectEnvelope(null, "chat message")).toThrow("chat message body required");
    expect(() => expectEnvelope({ protocolVersion: 4 }, "chat message")).toThrow("Unsupported or missing protocolVersion");
    expect(() => expectEnvelope({}, "chat message")).toThrow(ProtocolError);
    expect(expectEnvelope({ protocolVersion: 5, text: "hi" }, "chat message")).toEqual({ protocolVersion: 5, text: "hi" });
  });
});
