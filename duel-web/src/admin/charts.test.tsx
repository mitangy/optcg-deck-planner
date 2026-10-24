// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { BarChart, TrendChart } from "./charts";

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

function mount(node: React.ReactNode): HTMLElement {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(node));
  return host;
}

const click = (el: Element) => act(() => (el as HTMLElement).click());

const series = [
  { key: "ranked", label: "Ranked", color: "red" },
  { key: "casual", label: "Casual", color: "blue" },
];
const days = ["2026-10-19", "2026-10-20", "2026-10-21"];
const values = { ranked: [4, 0, 2], casual: [2, 9, 1] };
const chart = (extra: Partial<React.ComponentProps<typeof BarChart>> = {}) => <BarChart title="Matches per day" days={days} series={series} values={values} {...extra} />;

describe("BarChart interactions (#691)", () => {
  it("hides a series' bars from the legend button and rescales to what is left, but keeps the last one (#691)", () => {
    const el = mount(chart());
    const rects = (key: string) => el.querySelectorAll(`rect.adm-bar[data-series="${key}"]`).length;
    expect(rects("casual")).toBe(3);
    expect(el.querySelector(".adm-chart-max")!.textContent).toBe("9");
    const [ranked, casual] = [...el.querySelectorAll<HTMLButtonElement>(".adm-legend-btn")];
    expect(ranked!.getAttribute("aria-pressed")).toBe("true");
    click(casual!);
    expect(rects("casual")).toBe(0);
    expect(rects("ranked")).toBe(2);
    expect(casual!.getAttribute("aria-pressed")).toBe("false");
    expect(el.querySelector(".adm-chart-max")!.textContent).toBe("4");
    click(ranked!);
    expect(rects("ranked")).toBe(2);
    expect(ranked!.getAttribute("aria-pressed")).toBe("true");
    click(casual!);
    expect(rects("casual")).toBe(3);
  });

  it("shows a day's date, counts and total in a tooltip and reports the picked day (#691)", () => {
    const onSelectDay = vi.fn();
    const el = mount(chart({ onSelectDay }));
    expect(el.querySelector(".adm-tip")).toBeNull();
    click(el.querySelector('.adm-bar-hit[data-day="2026-10-20"]')!);
    const tip = el.querySelector(".adm-tip")!;
    expect(tip.textContent).toContain("Tue, Oct 20");
    expect(tip.textContent).toContain("Casual9");
    expect(tip.textContent).toContain("Ranked0");
    expect(tip.textContent).toContain("Total9");
    expect(onSelectDay).toHaveBeenCalledWith("2026-10-20");
    expect(onSelectDay).toHaveBeenCalledTimes(1);
  });

  it("marks the selected day on the chart (#691)", () => {
    expect(mount(chart({ selectedDay: "2026-10-21" })).querySelectorAll("rect.adm-bar-sel").length).toBe(1);
  });
});

describe("TrendChart interactions (#691)", () => {
  const points = [
    { at: 1_000, value: 80, label: "baseline", id: "row-a", date: "2026-10-01", spend: 1.5 },
    { at: 2_000, value: 90, label: "tweak", id: "row-b", date: "2026-10-02", spend: null },
  ];
  const trend = (onSelectPoint?: (id: string) => void) => (
    <TrendChart points={points} scale={{ min: 70, max: 100 }} format={(v) => `${v}%`} name="Score" markerAt={null} markerLabel="" onSelectPoint={onSelectPoint} />
  );

  it("shows the run, date, score and spend when a dot is focused, and reports the run when it is picked (#691)", () => {
    const onSelect = vi.fn();
    const el = mount(trend(onSelect));
    const dots = el.querySelectorAll<HTMLButtonElement>("button.adm-dot");
    expect(dots.length).toBe(2);
    expect(el.querySelector(".adm-tip")).toBeNull();
    act(() => dots[0]!.focus());
    const tip = el.querySelector(".adm-tip")!;
    expect(tip.textContent).toContain("baseline");
    expect(tip.textContent).toContain("2026-10-01");
    expect(tip.textContent).toContain("Score80%");
    expect(tip.textContent).toContain("Spend$1.50");
    click(dots[1]!);
    expect(onSelect).toHaveBeenCalledWith("row-b");
    act(() => dots[1]!.focus());
    expect(el.querySelector(".adm-tip")!.textContent).toContain("Spend—");
  });
});
