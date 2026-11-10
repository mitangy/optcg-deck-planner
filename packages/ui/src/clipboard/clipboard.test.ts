// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText, readClipboardText } from "./clipboard";

function stubClipboard(clip: unknown) {
  Object.defineProperty(navigator, "clipboard", { value: clip, configurable: true });
}
function stubExec(result: boolean) {
  const fn = vi.fn(() => result);
  (document as unknown as { execCommand: unknown }).execCommand = fn;
  return fn;
}
afterEach(() => {
  stubClipboard(undefined);
  delete (document as unknown as { execCommand?: unknown }).execCommand;
});

describe("copyText (#1226)", () => {
  it("uses the async clipboard API when it works and skips the textarea path", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard({ writeText });
    const exec = stubExec(true);
    expect(await copyText("deck")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("deck");
    expect(exec).not.toHaveBeenCalled();
  });

  it("falls back to the textarea copy when navigator.clipboard is missing (#1226)", async () => {
    stubClipboard(undefined);
    let copied = "";
    (document as unknown as { execCommand: unknown }).execCommand = vi.fn(() => {
      copied = document.querySelector("textarea")!.value;
      return true;
    });
    expect(await copyText("4xOP01-016")).toBe(true);
    expect(copied).toBe("4xOP01-016");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("falls back to the textarea copy when the async API rejects (#1226)", async () => {
    stubClipboard({ writeText: vi.fn().mockRejectedValue(new Error("denied")) });
    const exec = stubExec(true);
    expect(await copyText("x")).toBe(true);
    expect(exec).toHaveBeenCalledWith("copy");
  });

  it("reports failure when both paths fail (#1226)", async () => {
    stubClipboard(undefined);
    stubExec(false);
    expect(await copyText("x")).toBe(false);
  });
});

describe("readClipboardText (#1226)", () => {
  it("returns the clipboard text", async () => {
    stubClipboard({ readText: vi.fn().mockResolvedValue("1xOP01-001") });
    expect(await readClipboardText()).toBe("1xOP01-001");
  });

  it("returns null when the API is missing", async () => {
    stubClipboard(undefined);
    expect(await readClipboardText()).toBeNull();
  });

  it("returns null when permission is denied", async () => {
    stubClipboard({ readText: vi.fn().mockRejectedValue(new Error("denied")) });
    expect(await readClipboardText()).toBeNull();
  });
});
