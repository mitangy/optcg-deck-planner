// @vitest-environment jsdom
import { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { MetaLeader } from "../api";

const leader = (leader_id: string, name: string): MetaLeader => ({
  leader_id,
  name,
  color: "Red",
  image_url: "",
  decks: 20,
  share: 0.1,
  top8: 2,
  wins: 10,
  losses: 10,
  ties: 0,
  win_rate: 0.5,
});

vi.mock("../api", async (orig) => ({
  ...(await orig<typeof import("../api")>()),
  api: {
    metaLeaders: vi.fn(async () => ({
      days: 30,
      min_players: 0,
      events: 1,
      total_decks: 40,
      source: "x",
      source_url: "https://x.test",
      leaders: [leader("OP01-002", "Trafalgar Law"), leader("OP01-001", "Roronoa Zoro")],
    })),
  },
}));

import { MetaPage } from "./MetaPage";

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = host = null;
});

describe("Meta leader search", () => {
  it("keeps the space when a name is typed key by key (#1375)", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter initialEntries={["/meta"]}>
            <MetaPage user={null} />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    const input = document.querySelector<HTMLInputElement>("input.card-search-input")!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    // Type one key at a time: each keystroke appends to what the box currently shows.
    for (const key of "trafalgar law") {
      await act(async () => {
        setValue.call(input, input.value + key);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    expect(input.value).toBe("trafalgar law");
    expect(document.body.textContent).toContain("Trafalgar Law");
    expect(document.body.textContent).not.toContain("Roronoa Zoro");
  });
});
