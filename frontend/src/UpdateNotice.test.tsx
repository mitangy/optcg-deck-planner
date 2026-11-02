// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { checkForUpdate } from "./appVersion";
import { UpdateNotice } from "./UpdateNotice";

vi.mock("./buildInfo", () => ({ BUILD_SHA: "abc1234" }));

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.unstubAllGlobals();
});

async function deploy(sha: string) {
  vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => ({ sha }) }));
  await act(async () => {
    await checkForUpdate();
  });
}
const card = () => document.querySelector('[aria-label="Update available"]');

describe("update notice (#864)", () => {
  it("Later hides the card until a newer build is deployed (#864)", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<UpdateNotice />));
    expect(card()).toBeNull();

    await deploy("def5678");
    expect(card()?.textContent).toContain("New version available");

    act(() => {
      [...card()!.querySelectorAll("button")].find((b) => b.textContent === "Later")!.click();
    });
    expect(card()).toBeNull();

    await deploy("def5678");
    expect(card()).toBeNull();

    await deploy("1234abc");
    expect(card()).not.toBeNull();
  });
});
