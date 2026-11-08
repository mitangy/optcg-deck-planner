// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../net/api", () => ({ fetchAuthMe: vi.fn() }));

import { fetchAuthMe } from "../net/api";
import { useWho } from "../tournaments/hooks";
import { resetAuthForTests, setAuthUser, useAccountRole, useAuthUser } from "./session";

const me = vi.mocked(fetchAuthMe);
let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
  resetAuthForTests();
  me.mockReset();
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

async function show(Probe: () => React.ReactNode) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<Probe />));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
  return host;
}

const account = (over: object = {}) => ({ id: 7, email: "m@e2e.test", name: "Miko", username: "Miko", ...over }) as never;

describe("auth selectors (refactor 2.1b)", () => {
  it("the account role is the signed-in account's role, and null before and without an answer", async () => {
    me.mockResolvedValue(account({ role: "moderator" }));
    const el = await show(() => <p>{String(useAccountRole())}</p>);
    expect(el.textContent).toBe("moderator");
    act(() => setAuthUser(null));
    expect(el.textContent).toBe("null");
  });

  it("the user follows what sign-in or a username change put in the store", async () => {
    me.mockResolvedValue(account({ username: null }));
    const el = await show(() => <p>{useAuthUser()?.username ?? "none"}</p>);
    expect(el.textContent).toBe("none");
    act(() => setAuthUser(account({ username: "Nami" })));
    expect(el.textContent).toBe("Nami");
  });

  it("tournaments' who is loading, then signed out, ready, or ready-without-a-username", async () => {
    me.mockResolvedValue(null);
    let el = await show(() => <p>{useWho().status}</p>);
    expect(el.textContent).toBe("signed-out");
    act(() => setAuthUser(account()));
    expect(el.textContent).toBe("ready");
    act(() => setAuthUser(account({ username: null })));
    expect(el.textContent).toBe("no-username");
    act(() => root?.unmount());
    resetAuthForTests();
    me.mockReturnValue(new Promise(() => undefined) as never);
    el = await show(() => <p>{useWho().status}</p>);
    expect(el.textContent).toBe("loading");
  });
});
