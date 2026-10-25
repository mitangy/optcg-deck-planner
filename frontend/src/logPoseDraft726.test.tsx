// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DRAFT_STATE_KEY, openDeckFor, openNewDeckFor, readLogPoseDraft, useLogPoseDraft } from "./logPose";

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
});

const DRAFT = { name: "Red Luffy", list: "1xST01-001\n4xST01-003\n4xST01-006" };

describe("Log Pose opens the planner's import page (#726)", () => {
  it("navigates to /import with the name and list in the router state, even when asked to open by itself (#726)", () => {
    const navigate = vi.fn();
    const open = openNewDeckFor(navigate);
    expect(open(DRAFT, { auto: true })).toBe(true);
    expect(open(DRAFT, { auto: false })).toBe(true);
    expect(navigate).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledWith("/import", { state: { [DRAFT_STATE_KEY]: DRAFT } });
  });

  it("opens a planner deck's page inside the app, and refuses a deck that isn't a planner one (#726)", () => {
    const navigate = vi.fn();
    const open = openDeckFor(navigate);
    expect(open("planner:7")).toBe(true);
    expect(navigate).toHaveBeenCalledWith("/decks/7");
    navigate.mockClear();
    expect(open("duel:d1")).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("reads the filled-in deck from router state and nothing else (#726)", () => {
    expect(readLogPoseDraft({ [DRAFT_STATE_KEY]: DRAFT })).toEqual(DRAFT);
    expect(readLogPoseDraft({ [DRAFT_STATE_KEY]: { name: "x", list: "  " } })).toBeNull();
    expect(readLogPoseDraft({ [DRAFT_STATE_KEY]: { name: 1, list: "1xST01-001" } })).toBeNull();
    expect(readLogPoseDraft(undefined)).toBeNull();
  });
});

function Form() {
  const [name, setName] = useState("");
  const [list, setList] = useState("");
  const filled = useLogPoseDraft((d) => {
    setName(d.name);
    setList(d.list);
  });
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div>
      <input id="name" value={name} onChange={(e) => setName(e.target.value)} />
      <textarea id="list" value={list} onChange={(e) => setList(e.target.value)} />
      <output id="note">{filled ? "Filled in by Log Pose" : ""}</output>
      <output id="state">{location.state === null ? "none" : "state"}</output>
      <button id="again" onClick={() => navigate("/import", { state: { [DRAFT_STATE_KEY]: { name: "Second", list: "1xST01-001" } } })} />
    </div>
  );
}

async function renderForm(state: unknown) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <MemoryRouter initialEntries={[{ pathname: "/import", state }]}>
        <Routes>
          <Route path="/import" element={<Form />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
}
const val = (sel: string) => (host!.querySelector(sel) as HTMLInputElement).value;

describe("useLogPoseDraft on the import page (#726)", () => {
  it("fills the name and list, marks the form as filled in by Log Pose, and forgets the state (#726)", async () => {
    await renderForm({ [DRAFT_STATE_KEY]: DRAFT });
    expect(val("#name")).toBe("Red Luffy");
    expect(val("#list")).toBe(DRAFT.list);
    expect(host!.querySelector("#note")!.textContent).toBe("Filled in by Log Pose");
    expect(host!.querySelector("#state")!.textContent).toBe("none");
  });

  it("fills in a second deck handed over while the page is already open (#726)", async () => {
    await renderForm({ [DRAFT_STATE_KEY]: DRAFT });
    await act(async () => (host!.querySelector("#again") as HTMLButtonElement).click());
    expect(val("#name")).toBe("Second");
    expect(val("#list")).toBe("1xST01-001");
  });

  it("leaves the form alone when nothing was handed over (#726)", async () => {
    await renderForm(null);
    expect(val("#name")).toBe("");
    expect(host!.querySelector("#note")!.textContent).toBe("");
  });
});
