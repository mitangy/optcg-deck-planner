import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { primaryAction } from "../../home/primaryAction";
import { PlayActions } from "./PlayActions";

function render(last: Parameters<typeof primaryAction>[0]): string {
  return renderToStaticMarkup(<PlayActions primary={primaryAction(last, true)} disabled={false} onPrimary={() => undefined} onPlay={() => undefined} />);
}

describe("mode tiles (#1391)", () => {
  it("tags only the tile of the mode played last, which is also the one outlined (#1391)", () => {
    const html = render("hotseat");
    expect(html.match(/mode-tile-tag/g)).toHaveLength(1);
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="true"[^>]*>(?:(?!<\/button>).)*Practice(?:(?!<\/button>).)*Last played/);
  });

  it("tags and outlines nothing when no mode was played yet (#1391)", () => {
    const html = render(null);
    expect(html).not.toContain("mode-tile-tag");
    expect(html).not.toContain("aria-current");
  });
});
