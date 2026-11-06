// @vitest-environment jsdom
import { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ReplaceDeckListDialog } from "./ReplaceDeckListDialog";

const replaceDeckList = vi.fn();
vi.mock("./api", async (orig) => ({
  ...(await orig<typeof import("./api")>()),
  api: { replaceDeckList: (...a: unknown[]) => replaceDeckList(...a) },
}));

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  replaceDeckList.mockReset();
});

const wait = () => new Promise((r) => setTimeout(r, 30));
const button = (text: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent?.trim() === text)!;
const box = () => document.querySelector<HTMLTextAreaElement>("textarea")!;

async function mount(onReplaced = vi.fn()) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const qc = new QueryClient();
  await act(async () => {
    root!.render(
      <QueryClientProvider client={qc}>
        <ReplaceDeckListDialog open deckId={42} deckName="Red Luffy" onClose={() => {}} onReplaced={onReplaced} />
      </QueryClientProvider>,
    );
  });
  return onReplaced;
}

async function type(text: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(box(), text);
    box().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("Replace with deck list dialog (#1016)", () => {
  it("sends the pasted list for this deck and hands the result back (#1016)", async () => {
    const detail = { id: 42, name: "Red Luffy", cards: [] };
    replaceDeckList.mockResolvedValue(detail);
    const onReplaced = await mount();
    expect(document.body.textContent).toContain("Replace Red Luffy?");
    await type("1xOP01-001\n4xOP01-016");
    await act(async () => {
      button("Replace deck").click();
    });
    await act(wait);
    expect(replaceDeckList).toHaveBeenCalledWith(42, "1xOP01-001\n4xOP01-016");
    expect(onReplaced).toHaveBeenCalledWith(detail);
  });

  it("keeps Replace deck disabled until something is pasted (#1016)", async () => {
    await mount();
    expect(button("Replace deck").disabled).toBe(true);
    await type("  \n ");
    expect(button("Replace deck").disabled).toBe(true);
    await type("4xOP01-016");
    expect(button("Replace deck").disabled).toBe(false);
  });

  it("shows the server's error and does not report success (#1016)", async () => {
    replaceDeckList.mockRejectedValue(new Error("No cards found in decklist"));
    const onReplaced = await mount();
    await type("garbage");
    await act(async () => {
      button("Replace deck").click();
    });
    await act(wait);
    expect(document.querySelector(".replace-deck-error")?.textContent).toBe("No cards found in decklist");
    expect(onReplaced).not.toHaveBeenCalled();
  });
});
