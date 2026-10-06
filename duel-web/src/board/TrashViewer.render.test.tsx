import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrashViewerPanel as TrashViewer } from "./TrashViewer";

afterEach(() => vi.unstubAllGlobals());

function stubSort(value: string | null) {
  vi.stubGlobal("localStorage", { getItem: () => value, setItem: () => {}, removeItem: () => {} });
}

// newest-first: three ST01-003, one ST01-014, one ST01-009
const cards = ["ST01-003", "ST01-014", "ST01-003", "ST01-009", "ST01-003"];

function render(sortable: boolean) {
  return renderToStaticMarkup(<TrashViewer title="Your trash" cards={cards} sortable={sortable} onClose={() => {}} />);
}

describe("trash viewer sort (#380)", () => {
  it("By card shows one tile per card with a ×N count and the distinct total", () => {
    stubSort("card");
    const html = render(true);
    expect((html.match(/class="card-tile/g) ?? []).length).toBe(3);
    expect(html).toContain("×3");
    expect(html).not.toContain("×1");
    expect(html).toContain("5 cards · 3 different");
    expect(html).toMatch(/aria-pressed="true"[^>]*>By card/);
  });

  it("Newest lists every copy with no count badges", () => {
    stubSort(null);
    const html = render(true);
    expect((html.match(/class="card-tile/g) ?? []).length).toBe(5);
    expect(html).not.toContain("trash-viewer-count");
    expect(html).toContain("5 cards · newest first");
  });

  it("a viewer that is not sortable ignores the saved choice and has no toggle", () => {
    stubSort("card");
    const html = render(false);
    expect(html).not.toContain("trash-viewer-sort");
    expect((html.match(/class="card-tile/g) ?? []).length).toBe(5);
  });
});
