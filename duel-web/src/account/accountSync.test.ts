import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../net/api", () => ({ fetchAuthMe: vi.fn() }));
vi.mock("../decks/planner", () => ({ pushLinkedDeckArt: vi.fn() }));
vi.mock("./cosmeticsSync", () => ({ syncCosmetics: vi.fn(async () => undefined), stopCosmeticsSync: vi.fn() }));
vi.mock("./settingsSync", () => ({ syncSettings: vi.fn(async () => undefined), stopSettingsSync: vi.fn() }));
vi.mock("./deckSync", () => ({ syncDecks: vi.fn(), stopDeckSync: vi.fn(), clearAccountDecks: vi.fn(), flushDeckSync: vi.fn() }));

import { pushLinkedDeckArt } from "../decks/planner";
import { syncDecks } from "./deckSync";
import { resyncOnReturn, startAccountSync, stopAccountSync } from "./accountSync";

describe("deck re-sync when the tab comes back (#1017)", () => {
  let doc: EventTarget & { visibilityState: string };
  let win: EventTarget;
  let clock: number;
  const now = () => clock;

  beforeEach(() => {
    doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
    win = new EventTarget();
    clock = 1_000_000;
    vi.stubGlobal("document", doc);
    vi.stubGlobal("window", win);
  });
  afterEach(() => vi.unstubAllGlobals());

  const back = () => doc.dispatchEvent(new Event("visibilitychange"));

  it("runs when the tab is shown again, but not within the minimum gap of the last run", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    resyncOnReturn(run, 60_000, now);
    clock += 59_000;
    back();
    expect(run).not.toHaveBeenCalled();
    clock += 2_000;
    back();
    expect(run).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    clock += 30_000;
    back();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("also runs when the window regains focus", () => {
    const run = vi.fn().mockResolvedValue(undefined);
    resyncOnReturn(run, 60_000, now);
    clock += 61_000;
    win.dispatchEvent(new Event("focus"));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("does nothing while the tab is hidden", () => {
    const run = vi.fn().mockResolvedValue(undefined);
    resyncOnReturn(run, 60_000, now);
    clock += 61_000;
    doc.visibilityState = "hidden";
    back();
    expect(run).not.toHaveBeenCalled();
  });

  it("does not start a second sync while one is still running, and tries again after it fails", async () => {
    let finish: (v: unknown) => void = () => undefined;
    const run = vi.fn().mockImplementationOnce(() => new Promise((_, rej) => (finish = rej))).mockResolvedValue(undefined);
    resyncOnReturn(run, 60_000, now);
    clock += 61_000;
    back();
    clock += 61_000;
    back();
    expect(run).toHaveBeenCalledTimes(1);
    finish(new Error("offline"));
    await new Promise((r) => setTimeout(r, 0));
    clock += 61_000;
    back();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("stops listening once stopped", () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const stop = resyncOnReturn(run, 60_000, now);
    stop();
    clock += 61_000;
    back();
    win.dispatchEvent(new Event("focus"));
    expect(run).not.toHaveBeenCalled();
  });
});

describe("account sync start (#1017)", () => {
  afterEach(() => {
    stopAccountSync();
    vi.unstubAllGlobals();
  });

  it("shows the alt arts of linked decks in the planner once the decks are synced", async () => {
    vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }));
    vi.stubGlobal("window", new EventTarget());
    const order: string[] = [];
    vi.mocked(syncDecks).mockImplementation(async () => void order.push("sync"));
    vi.mocked(pushLinkedDeckArt).mockImplementation(async () => void order.push("art"));
    await startAccountSync({ id: 5 } as never);
    expect(order).toEqual(["sync", "art"]);
  });
});
