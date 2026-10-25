// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "./Tabs";

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

const NAMES = ["Alpha", "Beta", "Gamma"];

function Rows({ manual }: { manual?: boolean }) {
  return (
    <TabGroup manual={manual}>
      <TabList className="row" aria-label="Sections">
        {NAMES.map((n) => (
          <Tab key={n} className={({ selected }) => (selected ? "t on" : "t")}>
            {n}
          </Tab>
        ))}
      </TabList>
      <TabPanels>
        {NAMES.map((n) => (
          <TabPanel key={n} className="pane">
            <p className="body">{n} body</p>
          </TabPanel>
        ))}
      </TabPanels>
    </TabGroup>
  );
}

/** Selection kept in the caller's state, the way the Lobby and Log Pose rows use it. */
function Controlled() {
  const [index, setIndex] = useState(1);
  return (
    <>
      <TabGroup selectedIndex={index} onChange={setIndex}>
        <TabList aria-label="Sections">
          {NAMES.map((n) => (
            <Tab key={n}>{n}</Tab>
          ))}
        </TabList>
        <TabPanels>
          {NAMES.map((n) => (
            <TabPanel key={n}>{n} body</TabPanel>
          ))}
        </TabPanels>
      </TabGroup>
      <output id="kept">{NAMES[index]}</output>
      <button id="outside" type="button" onClick={() => setIndex(2)}>
        Go to Gamma
      </button>
    </>
  );
}

const tabs = () => [...document.querySelectorAll<HTMLElement>('[role="tab"]')];
const selected = () => tabs().filter((t) => t.getAttribute("aria-selected") === "true").map((t) => t.textContent);
// Headless UI leaves an empty hidden placeholder for each panel that is not selected.
const bodies = () => [...document.querySelectorAll('[role="tabpanel"]')].map((p) => p.textContent).filter(Boolean);
const wait = () => new Promise((r) => setTimeout(r, 20));

async function key(k: string) {
  await act(async () => {
    document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
    document.activeElement?.dispatchEvent(new KeyboardEvent("keyup", { key: k, bubbles: true, cancelable: true }));
    await wait();
  });
}

async function mount(ui: React.ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(ui));
}

describe("Tabs", () => {
  it("shows the panel of the selected tab and marks only that tab aria-selected (#719)", async () => {
    await mount(<Rows />);
    expect(document.querySelector('[role="tablist"]')?.getAttribute("aria-label")).toBe("Sections");
    expect(selected()).toEqual(["Alpha"]);
    expect(bodies()).toEqual(["Alpha body"]);
    await act(async () => tabs()[2]!.click());
    expect(selected()).toEqual(["Gamma"]);
    expect(bodies()).toEqual(["Gamma body"]);
    expect(tabs()[2]!.className).toBe("t on");
    expect(tabs()[0]!.className).toBe("t");
  });

  it("keeps the app's own classes on the row and the panel, beside the shared ones (#719)", async () => {
    await mount(<Rows />);
    const row = document.querySelector('[role="tablist"]')!;
    expect(row.classList.contains("row")).toBe(true);
    expect(row.classList.contains("ui-tab-list")).toBe(true);
    const panel = [...document.querySelectorAll('[role="tabpanel"]')].find((p) => p.textContent)!;
    expect(panel.classList.contains("pane")).toBe(true);
    expect(panel.classList.contains("ui-tab-panel")).toBe(true);
  });

  it("Right and Left arrows move to the next and previous tab and select it (#719)", async () => {
    await mount(<Rows />);
    tabs()[0]!.focus();
    await key("ArrowRight");
    expect(selected()).toEqual(["Beta"]);
    expect(document.activeElement).toBe(tabs()[1]);
    expect(bodies()).toEqual(["Beta body"]);
    await key("ArrowLeft");
    expect(selected()).toEqual(["Alpha"]);
  });

  it("Home and End jump to the first and last tab (#719)", async () => {
    await mount(<Rows />);
    tabs()[1]!.focus();
    await act(async () => tabs()[1]!.click());
    await key("End");
    expect(selected()).toEqual(["Gamma"]);
    await key("Home");
    expect(selected()).toEqual(["Alpha"]);
    expect(document.activeElement).toBe(tabs()[0]);
  });

  it("only the selected tab is in the Tab order, and the panel is not a tab stop (#719)", async () => {
    await mount(<Rows />);
    expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1, -1]);
    const panel = [...document.querySelectorAll<HTMLElement>('[role="tabpanel"]')].find((p) => p.textContent)!;
    expect(panel.tabIndex).toBe(-1);
  });

  it("manual: arrows move focus only, Enter picks the focused tab (#719)", async () => {
    await mount(<Rows manual />);
    tabs()[0]!.focus();
    await key("ArrowRight");
    expect(document.activeElement).toBe(tabs()[1]);
    expect(selected()).toEqual(["Alpha"]);
    expect(bodies()).toEqual(["Alpha body"]);
    await key("Enter");
    expect(selected()).toEqual(["Beta"]);
    expect(bodies()).toEqual(["Beta body"]);
  });

  it("controlled: the caller's index picks the tab, a click or arrow reports it, and the caller can move it (#719)", async () => {
    await mount(<Controlled />);
    const kept = () => document.getElementById("kept")!.textContent;
    expect(selected()).toEqual(["Beta"]);
    expect(bodies()).toEqual(["Beta body"]);
    tabs()[1]!.focus();
    await key("ArrowLeft");
    expect(kept()).toBe("Alpha");
    expect(selected()).toEqual(["Alpha"]);
    await act(async () => document.getElementById("outside")!.click());
    expect(selected()).toEqual(["Gamma"]);
    expect(bodies()).toEqual(["Gamma body"]);
  });
});
