import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Renders the − / + pair with these sizes stored on this device (settings are read once per module load). */
async function render(popupSize: number, setting?: "popupSize" | "previewPopupSize", previewPopupSize?: number): Promise<string> {
  vi.resetModules();
  vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ popupSize, previewPopupSize }), setItem: () => {}, removeItem: () => {} });
  const { PopupSizeButtons } = await import("./PopupSizeButtons");
  return renderToStaticMarkup(<PopupSizeButtons className="b" what="card preview" setting={setting} />);
}

const button = (html: string, label: string) => html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))?.[0] ?? "";

describe("pop-up size buttons (#555)", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("both can be pressed between 70% and 160% (#555)", async () => {
    const html = await render(100);
    expect(button(html, "Smaller card preview")).not.toContain("disabled");
    expect(button(html, "Bigger card preview")).not.toContain("disabled");
  });

  it("Smaller is disabled at 70% and Bigger at 160% (#555)", async () => {
    const min = await render(70);
    expect(button(min, "Smaller card preview")).toContain("disabled");
    expect(button(min, "Bigger card preview")).not.toContain("disabled");
    const max = await render(160);
    expect(button(max, "Bigger card preview")).toContain("disabled");
    expect(button(max, "Smaller card preview")).not.toContain("disabled");
  });

  it("the card preview's buttons follow the Card pop-up size, not the Pop-up size (#572)", async () => {
    const html = await render(160, "previewPopupSize", 100);
    expect(button(html, "Bigger card preview")).not.toContain("disabled");
    const min = await render(100, "previewPopupSize", 70);
    expect(button(min, "Smaller card preview")).toContain("disabled");
    expect(min).toContain("Smaller (70%)");
    expect(min).toContain('aria-label="Card pop-up size"');
  });
});
