// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ReportPlayerDialog } from "./ReportPlayerDialog";
import type { ReportRequest, ReportTarget } from "./reportLogic";

let root: Root | null = null;
let host: HTMLElement | null = null;
let sent: ReportRequest[] = [];

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  sent = [];
});

const wait = () => new Promise((r) => setTimeout(r, 30));
const q = <T extends Element>(sel: string) => document.querySelector<T>(sel);
const byText = (text: string) => Array.from(document.querySelectorAll<HTMLElement>("button")).find((b) => b.textContent?.includes(text))!;

async function render(target: ReportTarget, submit: (b: ReportRequest) => Promise<void> = async (b) => void sent.push(b)) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<ReportPlayerDialog target={target} submit={submit} onClose={() => undefined} />);
    await wait();
  });
}

async function click(el: Element) {
  await act(async () => {
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
    }
    await wait();
  });
}

const submitBtn = () => q<HTMLButtonElement>('button[type="submit"]')!;
const art = { playmat: "data:image/png;base64,AAAA", cardBack: null };
const one: ReportTarget = { source: "match", matchId: "room-1", players: [{ name: "Nami", seat: 1, images: art }] };

describe("Report player dialog (#810)", () => {
  it("names the player, needs a reason, and an image report needs the playmat or card back chosen first (#810)", async () => {
    await render(one);
    expect(q(".feedback-title")!.textContent).toBe("Report Nami");
    expect(submitBtn().disabled).toBe(true);
    await click(byText("Inappropriate playmat or card back"));
    // The reason alone is not enough for an image report.
    expect(submitBtn().disabled).toBe(true);
    // Their card back is the default, so it cannot be picked; their playmat can.
    expect(byText("Card back").disabled).toBe(true);
    await click(byText("Playmat"));
    expect(submitBtn().disabled).toBe(false);
  });

  it("sends the chosen reason with the opponent's seat and image, then thanks without naming the reporter (#810)", async () => {
    await render(one);
    await click(byText("Inappropriate playmat or card back"));
    await click(byText("Playmat"));
    await click(submitBtn());
    expect(sent).toEqual([{ reason: "image", source: "match", match_id: "room-1", reported_seat: 1, image_kind: "playmat", image_src: art.playmat }]);
    expect(q('[role="status"]')!.textContent).toBe("Thanks. A moderator will review it. Nami won't be told who reported them.");
  });

  it("a spectator picks which of the two players first, and the report names that seat (#810)", async () => {
    const spec: ReportTarget = { source: "spectate", matchId: "room-2", players: [{ name: "Luffy", seat: 0 }, { name: "Nami", seat: 1 }] };
    await render(spec);
    expect(q(".feedback-title")!.textContent).toBe("Report a player");
    await click(byText("Toxic or abusive behavior"));
    expect(submitBtn().disabled).toBe(true);
    await click(byText("Nami"));
    expect(q(".feedback-title")!.textContent).toBe("Report Nami");
    await click(submitBtn());
    expect(sent[0]).toMatchObject({ reason: "toxic", source: "spectate", reported_seat: 1 });
  });

  it("shows the server's message and keeps the form when sending fails (#810)", async () => {
    await render(one, async () => {
      throw new Error("You have sent a lot of reports recently. Please try again later.");
    });
    await click(byText("Toxic or abusive behavior"));
    await click(submitBtn());
    expect(q('[role="alert"]')!.textContent).toMatch(/try again later/);
    expect(submitBtn().disabled).toBe(false);
  });
});
