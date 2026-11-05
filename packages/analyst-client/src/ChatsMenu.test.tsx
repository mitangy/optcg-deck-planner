// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ChatsMenu } from "./ChatsMenu";
import type { ThreadRow } from "./scopes";

const rows: ThreadRow[] = [
  { id: 5, title: "Zoro Aggro", updated_at: "2026-11-04T10:00:00Z", scope: "deck:planner:7" },
  { id: 1, title: "Rules chat", updated_at: "2026-11-03T10:00:00Z", scope: "general" },
];

let root: Root | null = null;
let host: HTMLElement | null = null;
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = host = null;
  vi.unstubAllGlobals();
});

async function open(props: { busy: boolean; threadId: number | null; onPick: (r: ThreadRow) => void }) {
  vi.stubGlobal("fetch", (async (url: string | URL | Request) => {
    const scope = new URL(String(url)).searchParams.get("scope");
    return Response.json({ threads: rows.filter((r) => !scope || r.scope === scope) });
  }) as typeof fetch);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<ChatsMenu apiBase="https://api.test" active={{ key: "deck:planner:7", title: "Zoro Aggro" }} {...props} />));
  await act(async () => (host!.querySelector(".lp-chats-btn") as HTMLButtonElement).click());
  await act(async () => void (await new Promise((r) => setTimeout(r, 10))));
}
const rowFor = (name: string) => [...host!.querySelectorAll<HTMLButtonElement>(".lp-chats-row")].find((r) => r.textContent?.includes(name))!;

describe("the Chats list while an answer streams (#970)", () => {
  it("lets the player pick nothing but the open chat, so the answer lands where it was asked (#970)", async () => {
    const onPick = vi.fn();
    await open({ busy: true, threadId: 5, onPick });
    expect(rowFor("Zoro Aggro").disabled).toBe(false);
    expect(rowFor("Rules chat").disabled).toBe(true);
    await act(async () => rowFor("Rules chat").click());
    expect(onPick).not.toHaveBeenCalled();
  });

  it("picks a chat when idle, marks the open one, and closes on Escape without closing the panel (#970)", async () => {
    const onPick = vi.fn();
    await open({ busy: false, threadId: 5, onPick });
    expect(rowFor("Zoro Aggro").getAttribute("aria-current")).toBe("true");
    expect(rowFor("Rules chat").getAttribute("aria-current")).toBeNull();
    await act(async () => rowFor("Rules chat").click());
    expect(onPick).toHaveBeenCalledWith(rows[1]);
    expect(host!.querySelector(".lp-chats-menu")).toBeNull();

    await act(async () => (host!.querySelector(".lp-chats-btn") as HTMLButtonElement).click());
    const esc = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    await act(async () => void document.body.dispatchEvent(esc));
    expect(esc.defaultPrevented).toBe(true);
    expect(host!.querySelector(".lp-chats-menu")).toBeNull();
  });
});
