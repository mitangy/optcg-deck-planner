// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const me = vi.hoisted(() => vi.fn());
vi.mock("../api", () => ({ api: { me } }));
vi.mock("./Shell", () => ({ Shell: ({ children }: { children: React.ReactNode }) => <div data-testid="shell">{children}</div> }));
vi.mock("./lazyPages", () => ({ ShoppingPage: () => null }));
vi.mock("../pages/LandingPage", () => ({ PlannerLandingPage: () => null }));
vi.mock("../cards/PublicCardScreen", () => ({ PublicCardScreen: () => null }));
vi.mock("../meta/PublicMetaScreen", () => ({ PublicMetaScreen: () => null }));
vi.mock("../cards/CardPage", () => ({ CardPage: () => null }));
vi.mock("../meta/MetaPage", () => ({ MetaPage: () => null }));
vi.mock("../pages/shopping/lightboxActions", () => ({ renderCardPageActions: () => null }));

import { RequireAuth } from "./routeGuards";

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = host = null;
  me.mockReset();
});

async function mount() {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root!.render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/decks"]}>
          <Routes>
            <Route path="/login" element={<p>login page</p>} />
            <Route path="/decks" element={<RequireAuth><p>decks page</p></RequireAuth>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });
  await vi.waitFor(() => expect(host!.textContent).not.toBe("Loading…"));
}

describe("RequireAuth", () => {
  it("a failed sign-in check shows Can't reach the server instead of the login page, and Try again recovers (#1346)", async () => {
    me.mockRejectedValueOnce(new Error("network down"));
    await mount();
    expect(host!.textContent).toContain("Can't reach the server");
    expect(host!.textContent).not.toContain("login page");
    me.mockResolvedValueOnce({ id: 1, email: "a@b.c", name: "Nami" });
    await act(async () => {
      host!.querySelector<HTMLButtonElement>("button")!.click();
    });
    await vi.waitFor(() => expect(host!.textContent).toContain("decks page"));
  });

  it("a successful check with no user redirects to the login page (#1346)", async () => {
    me.mockResolvedValueOnce(null);
    await mount();
    expect(host!.textContent).toContain("login page");
    expect(host!.textContent).not.toContain("Can't reach the server");
  });
});
