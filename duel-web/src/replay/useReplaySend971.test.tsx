// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Intent } from "../net/protocol";
import type { ReplayPayload } from "./replayApi";
import { useReplay, type Replay } from "./useReplay";

const GAME = JSON.parse(readFileSync(resolve(process.cwd(), "e2e/data/replay-purple-red.json"), "utf8")) as ReplayPayload;

let root: Root | null = null;
let latest: Replay | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  latest = null;
});

function Probe() {
  latest = useReplay(GAME);
  return null;
}

async function ready(): Promise<Extract<Replay, { phase: "ready" }>> {
  await act(async () => {
    root = createRoot(document.createElement("div"));
    root.render(<Probe />);
  });
  for (let i = 0; i < 400 && latest?.phase !== "ready"; i++) await act(async () => void (await new Promise((r) => setTimeout(r, 10))));
  if (latest?.phase !== "ready") throw new Error("replay never became ready");
  return latest;
}

const giveDon = (donId: string): Intent => ({ type: "give_don", donId, targetId: "leader_62" }) as unknown as Intent;

describe("replay moves", () => {
  it("two moves sent at once in a replay both apply (#971)", async () => {
    const r = await ready();
    await act(async () => r.actions.goTo(2));
    expect((latest as Extract<Replay, { phase: "ready" }>).controls.step).toBe(2);
    // Recorded intents 2 and 3: attach two DON in one handler, with no render between the sends.
    await act(async () => {
      const send = (latest as Extract<Replay, { phase: "ready" }>).sendIntent;
      send(giveDon("don_63"));
      send(giveDon("don_64"));
    });
    const after = latest as Extract<Replay, { phase: "ready" }>;
    expect(after.controls.step).toBe(4);
    expect(after.controls.branch).toBeNull();
    expect(after.error).toBeNull();
  }, 30_000);

  it("two moves of the viewer's own line sent at once both land on the line (#971)", async () => {
    const r = await ready();
    await act(async () => r.actions.goTo(2));
    // The recording attached don_63 first, so this order leaves it: the first send opens a line, the second extends it.
    await act(async () => {
      const send = (latest as Extract<Replay, { phase: "ready" }>).sendIntent;
      send(giveDon("don_64"));
      send(giveDon("don_63"));
    });
    const after = latest as Extract<Replay, { phase: "ready" }>;
    expect(after.controls.branch?.moves).toBe(2);
    expect(after.error).toBeNull();
  }, 30_000);
});
