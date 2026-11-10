// @vitest-environment jsdom
import { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { MetaDeck } from "../api";
import { MetaDeckRow } from "./MetaPage";

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = host = null;
  Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
  delete (document as unknown as { execCommand?: unknown }).execCommand;
});

const deck = {
  id: 7,
  event: "Regional",
  event_url: "https://x.test",
  date: "2026-01-01",
  players: 8,
  placing: 1,
  record: { wins: 1, losses: 0, ties: 0 },
  cards: [],
  card_count: 0,
  text: "4xOP01-016",
} as unknown as MetaDeck;
const copyButton = () =>
  Array.from(document.querySelectorAll("button")).find((b) => /Cop(y list|ied)/.test(b.textContent ?? ""))!;

describe("Meta deck Copy list (#1226)", () => {
  it("still copies when navigator.clipboard is unavailable (#1226)", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    const exec = vi.fn(() => true);
    (document as unknown as { execCommand: unknown }).execCommand = exec;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter>
            <ul>
              <MetaDeckRow deck={deck} leader={{ id: "OP01-001", name: "Zoro" }} user={null} leaderPath="/meta/OP01-001" />
            </ul>
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      copyButton().click();
    });
    expect(exec).toHaveBeenCalledWith("copy");
    expect(copyButton().textContent).toBe("Copied");
    expect(document.querySelector(".meta-deck-error")).toBeNull();
  });
});
