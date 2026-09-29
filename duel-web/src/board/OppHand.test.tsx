import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OppHandFan, OppHandHint } from "./TurnStatusPanel";

function countBadge(html: string): string | undefined {
  return html.match(/class="opp-hand-count"[^>]*>(\d+)</)?.[1];
}

describe("opponent hand count", () => {
  it("shows the full hand size beside the capped row of backs", () => {
    const html = renderToStaticMarkup(<OppHandHint count={11} cardBackUrl={null} />);
    expect(countBadge(html)).toBe("11");
    expect(html.match(/class="card-back"/g)).toHaveLength(8);
  });

  it("shows the full hand size beside the capped fan", () => {
    const html = renderToStaticMarkup(<OppHandFan count={13} cardBackUrl={null} />);
    expect(countBadge(html)).toBe("13");
  });
});
