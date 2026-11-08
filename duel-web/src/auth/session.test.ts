import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../net/api", () => ({ fetchAuthMe: vi.fn() }));

import { fetchAuthMe } from "../net/api";
import { AUTH_MAX_AGE_MS, clearAuth, ensureAuth, getAuth, refreshAuth, resetAuthForTests, setAuthUser } from "./session";

const me = vi.mocked(fetchAuthMe);
const user = (over: Record<string, unknown> = {}) => ({ id: 7, email: "miko@e2e.test", name: "Miko", username: "Miko", ...over }) as never;

/** A /auth/me call the test settles by hand. */
function deferred() {
  let resolve!: (u: unknown) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<unknown>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  resetAuthForTests();
  me.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("auth session store (refactor 2.1b)", () => {
  it("answers every caller of a cold load from one /auth/me request", async () => {
    const d = deferred();
    me.mockReturnValue(d.promise as never);
    const asks = [ensureAuth(), ensureAuth(), ensureAuth()];
    expect(getAuth().status).toBe("loading");
    d.resolve(user());
    const answers = await Promise.all(asks);
    expect(me).toHaveBeenCalledTimes(1);
    expect(answers.map((u) => u?.id)).toEqual([7, 7, 7]);
    expect(getAuth()).toMatchObject({ status: "ready", user: { id: 7 } });
  });

  it("does not ask again once it knows the answer", async () => {
    me.mockResolvedValue(user());
    await ensureAuth();
    await ensureAuth();
    expect(me).toHaveBeenCalledTimes(1);
  });

  it("is signed out when the server says nobody is", async () => {
    me.mockResolvedValue(null);
    expect(await ensureAuth()).toBeNull();
    expect(getAuth()).toEqual({ status: "signed-out", user: null });
    await ensureAuth();
    expect(me).toHaveBeenCalledTimes(1);
  });

  it("shows signed out when the request fails, and tries again on the next ask", async () => {
    me.mockRejectedValueOnce(new Error("offline"));
    expect(await ensureAuth()).toBeNull();
    expect(getAuth().status).toBe("signed-out");
    me.mockResolvedValueOnce(user());
    expect(await ensureAuth()).toMatchObject({ id: 7 });
    expect(getAuth().status).toBe("ready");
  });

  it("keeps a signed-in player signed in when a later re-check fails", async () => {
    me.mockResolvedValueOnce(user());
    await ensureAuth();
    me.mockRejectedValueOnce(new Error("offline"));
    await refreshAuth();
    expect(getAuth()).toMatchObject({ status: "ready", user: { id: 7 } });
  });

  it("checks again once the answer is older than the max age", async () => {
    vi.useFakeTimers();
    me.mockResolvedValue(user());
    await ensureAuth();
    vi.advanceTimersByTime(AUTH_MAX_AGE_MS - 1000);
    await ensureAuth();
    expect(me).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    await ensureAuth();
    expect(me).toHaveBeenCalledTimes(2);
  });

  it("refreshAuth asks the server again even when it already knows", async () => {
    me.mockResolvedValueOnce(user({ username: null }));
    await ensureAuth();
    me.mockResolvedValueOnce(user({ username: "Miko" }));
    expect((await refreshAuth())?.username).toBe("Miko");
    expect(getAuth().user?.username).toBe("Miko");
  });

  it("takes the user a sign-in or username change returned without asking the server", async () => {
    setAuthUser(user({ username: "Nami" }));
    expect(getAuth()).toMatchObject({ status: "ready", user: { username: "Nami" } });
    expect((await ensureAuth())?.username).toBe("Nami");
    expect(me).not.toHaveBeenCalled();
  });

  it("is signed out after clearAuth, and a slow /auth/me that was already on its way cannot sign them back in", async () => {
    const d = deferred();
    me.mockReturnValueOnce(d.promise as never);
    const pending = ensureAuth();
    clearAuth();
    d.resolve(user());
    await pending;
    expect(getAuth()).toEqual({ status: "signed-out", user: null });
    await ensureAuth();
    expect(me).toHaveBeenCalledTimes(1);
  });
});
